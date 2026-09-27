"""The standalone app's local server: documents, content, uploads and the
live collaboration socket, as the KherveDOC web app uses them."""

import asyncio
import base64
import json
import os

import pytest
from aiohttp import ClientSession
from pycrdt import Doc, Text, create_sync_message, create_update_message

from khervedoc_desktop.local import hocuspocus as hp
from khervedoc_desktop.local.server import LocalServer
from khervedoc_desktop.local.store import DocFile, Library


@pytest.fixture
def server(tmp_path):
    static = tmp_path / "web"
    (static / "docs" / "[id]").mkdir(parents=True)
    (static / "docs" / "[id]" / "index.html").write_text("<p>editor</p>")
    (static / "index.html").write_text("<p>home</p>")
    (static / "404.html").write_text("<p>404</p>")
    library = Library(tmp_path / "data", tmp_path / "Documents")
    srv = LocalServer(library, static, "5.7.0", port=0)
    srv.start()
    yield srv
    srv.stop()


def run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def test_documents_and_content(server):
    async def go():
        api = server.origin + "/api/v1.0/"
        async with ClientSession() as s:
            conf = await (await s.get(api + "config/")).json()
            assert conf["COLLABORATION_WS_URL"].startswith("ws://127.0.0.1:")
            assert conf["RELEASE_VERSION"] == "5.7.0" and conf["KHERVE_LOCAL"]
            me = await (await s.get(api + "users/me/")).json()
            assert me["id"]
            r = await s.post(api + "documents/", json={"title": "Plan",
                                                       "kind": "doc"})
            assert r.status == 201
            doc = await r.json()
            assert doc["abilities"]["partial_update"] is True
            assert doc["abilities"]["accesses_view"] is False
            listing = await (await s.get(api + "documents/?page_size=10")).json()
            assert [d["id"] for d in listing["results"]] == [doc["id"]]

            # Save content as the editor does, then read it back.
            ydoc = Doc()
            ydoc.get("document-store", type=Text).insert(0, "hello")
            payload = base64.b64encode(ydoc.get_update()).decode()
            r = await s.patch(api + f"documents/{doc['id']}/content/",
                              json={"content": payload, "websocket": False})
            assert r.status == 200
            text = await (await s.get(
                api + f"documents/{doc['id']}/content/")).text()
            back = Doc()
            back.apply_update(base64.b64decode(text))
            assert str(back.get("document-store", type=Text)) == "hello"

            r = await s.patch(api + f"documents/{doc['id']}/",
                              json={"title": "Plan B"})
            assert (await r.json())["title"] == "Plan B"

            # The editor page and an unknown API call.
            page = await (await s.get(server.doc_url(doc["id"]))).text()
            assert "editor" in page
            assert (await s.get(api + "documents/{}/ai-proxy/".format(
                doc["id"]))).status == 404
            return doc["id"]

    doc_id = run(go())
    file = server.library.get(doc_id)
    assert file.meta()["title"] == "Plan B"
    assert file.content()


def test_upload_and_media(server):
    doc_id = server.library.create("Pictures")

    async def go():
        api = server.origin + "/api/v1.0/"
        async with ClientSession() as s:
            from aiohttp import FormData
            form = FormData()
            form.add_field("file", b"\x89PNG fake", filename="cat.png",
                           content_type="image/png")
            r = await s.post(api + f"documents/{doc_id}/attachment-upload/",
                             data=form)
            assert r.status == 201
            url = (await r.json())["file"]
            assert url.startswith(f"/media/{doc_id}/")
            m = await s.get(server.origin + url)
            assert m.status == 200 and m.content_type == "image/png"
            assert await m.read() == b"\x89PNG fake"

    run(go())


def test_live_sync_between_two_editors(server):
    doc_id = server.library.create("Together")

    async def editor(session, text=None):
        ws = await session.ws_connect(
            f"ws://127.0.0.1:{server.port}/collaboration/ws/?room={doc_id}")
        await ws.send_bytes(hp.auth_message(doc_id))
        document, kind, rest = hp.parse((await ws.receive()).data)
        assert kind == hp.AUTH and hp.parse_auth(rest) == (True, "read-write")
        ydoc = Doc()
        await ws.send_bytes(hp.frame(doc_id, create_sync_message(ydoc)))
        return ws, ydoc

    async def go():
        async with ClientSession() as s:
            a, adoc = await editor(s)
            b, bdoc = await editor(s)
            # A types: B receives the update through the server.
            text = adoc.get("t", type=Text)
            updates = []
            sub = adoc.observe(lambda e: updates.append(e.update))
            text.insert(0, "shared")
            await a.send_bytes(hp.frame(doc_id,
                                        create_update_message(updates[0])))
            got = None
            for _ in range(10):
                msg = await asyncio.wait_for(b.receive(), 5)
                _doc, kind, rest = hp.parse(msg.data)
                if kind == hp.SYNC and rest[0] == 2:   # an update
                    from pycrdt import handle_sync_message
                    handle_sync_message(rest, bdoc)
                    got = str(bdoc.get("t", type=Text))
                    break
            assert got == "shared"
            await a.close()
            await b.close()

    run(go())
    # Saved to the file when the editors left.
    saved = Doc()
    saved.apply_update(server.library.get(doc_id).content())
    assert str(saved.get("t", type=Text)) == "shared"


def test_library_open_copy_and_move(tmp_path):
    lib = Library(tmp_path / "data", tmp_path / "Documents")
    doc_id = lib.create("Report")
    path = lib.get(doc_id).path
    assert path.name == "Report.kdoc"
    # A copy of a known file gets its own id.
    copy = tmp_path / "Copy.kdoc"
    copy.write_bytes(path.read_bytes())
    other = lib.open_path(copy)
    assert other != doc_id and DocFile(copy).meta()["id"] == other
    # Reopening the same file keeps its id.
    assert lib.open_path(path) == doc_id
    moved = tmp_path / "Moved.kdoc"
    moved.write_bytes(path.read_bytes())
    lib.move(doc_id, moved)
    assert lib.get(doc_id).path == moved.resolve()
    assert {e["id"] for e in lib.entries()} == {doc_id, other}


def test_untitled_files_take_their_title(tmp_path):
    import stat
    lib = Library(tmp_path / "data", tmp_path / "Documents")
    doc_id = lib.create()
    path = lib.get(doc_id).path
    assert path.name == "Untitled document.kdoc"
    assert stat.S_IMODE(path.stat().st_mode) & 0o044   # readable, not 0600
    assert lib.rename_to_title(doc_id, "Budget: 2027") is not None
    assert lib.get(doc_id).path.name == "Budget- 2027.kdoc"
    # Once named, the file keeps its name.
    assert lib.rename_to_title(doc_id, "Other") is None
    # A file saved elsewhere is never renamed.
    elsewhere = tmp_path / "Untitled document.kdoc"
    elsewhere.write_bytes(lib.get(doc_id).path.read_bytes())
    other = lib.open_path(elsewhere)
    assert lib.rename_to_title(other, "Moved") is None


def test_pyodide_is_kept_on_this_computer(server, tmp_path):
    cache = server.pyodide_dir
    cache.mkdir(parents=True, exist_ok=True)
    (cache / "pyodide.js").write_text("// cached")

    async def go():
        async with ClientSession() as s:
            base = server.origin + "/kherve-cell/pyodide/"
            r = await s.head(base + "pyodide.js")
            assert r.status == 200 and "javascript" in r.content_type
            assert (await (await s.get(base + "pyodide.js")).text()) == "// cached"
            assert (await s.get(base + "..%2Fsecret")).status == 404

    run(go())


def test_media_addresses_are_rewritten():
    from pycrdt import XmlElement, XmlFragment

    from khervedoc_desktop.sharing import LOCAL_MEDIA, media_urls, rewrite_media
    doc = Doc()
    frag = doc.get("document-store", type=XmlFragment)
    local = "http://127.0.0.1:38471/media/de4bd815-85e1-492a-a675-7388766936f2/" \
            "0123456789abcdef01234567.png"
    frag.children.append(XmlElement("blockGroup"))
    frag.children[0].children.append(XmlElement("image", {"url": local}))
    state = doc.get_update()
    assert media_urls(state) == [local]
    assert LOCAL_MEDIA.match(local)["key"] == "0123456789abcdef01234567.png"
    new = rewrite_media(state, {local: "https://kd.example/api/x"})
    assert media_urls(new) == ["https://kd.example/api/x"]


def test_quitting_with_an_editor_connected_is_quick(tmp_path):
    import time
    static = tmp_path / "web"
    static.mkdir()
    (static / "index.html").write_text("home")
    library = Library(tmp_path / "data", tmp_path / "Documents")
    srv = LocalServer(library, static, "1", port=0)
    srv.start()
    doc_id = library.create("Open")

    async def connect():
        s = ClientSession()
        ws = await s.ws_connect(
            f"ws://127.0.0.1:{srv.port}/collaboration/ws/?room={doc_id}")
        await ws.send_bytes(hp.auth_message(doc_id))
        await ws.receive()
        return s, ws

    loop = asyncio.new_event_loop()
    session, ws = loop.run_until_complete(connect())
    start = time.monotonic()
    srv.stop()
    assert time.monotonic() - start < 4
    loop.run_until_complete(session.close())


def test_shipped_pyodide_and_wheels_come_first(tmp_path):
    static = tmp_path / "web"
    static.mkdir()
    (static / "index.html").write_text("home")
    shipped = tmp_path / "pyodide"
    (shipped / "pypi").mkdir(parents=True)
    (shipped / "pyodide.js").write_text("// shipped")
    (shipped / "pypi.json").write_text('{"openpyxl": ["pypi/o.whl"]}')
    (shipped / "pypi" / "o.whl").write_bytes(b"wheel")
    library = Library(tmp_path / "data", tmp_path / "Documents")
    srv = LocalServer(library, static, "1", port=0, bundled_pyodide=shipped)
    srv.start()

    async def go():
        base = srv.origin + "/kherve-cell/pyodide/"
        async with ClientSession() as s:
            assert await (await s.get(base + "pyodide.js")).text() == "// shipped"
            assert (await (await s.get(base + "pypi.json")).json())["openpyxl"]
            assert await (await s.get(base + "pypi/o.whl")).read() == b"wheel"
            assert (await s.get(base + "pypi/missing.whl")).status == 404
            assert (await s.get(base + "pypi/..%2F..%2Fsecret")).status == 404

    try:
        run(go())
    finally:
        srv.stop()


def test_deleting_moves_the_file_away(server, monkeypatch, tmp_path):
    # Not the real Trash: a stand-in that just moves the file.
    import shutil

    from khervedoc_desktop.local import server as server_module
    trash = tmp_path / "Trash"
    trash.mkdir()
    monkeypatch.setattr(server_module, "_move_to_trash",
                        lambda p: bool(shutil.move(str(p), trash / p.name)))
    doc_id = server.library.create("Old notes")
    path = server.library.get(doc_id).path

    async def go():
        async with ClientSession() as s:
            r = await s.delete(server.origin + f"/api/v1.0/documents/{doc_id}/")
            assert r.status == 204
            r = await s.get(server.origin + f"/api/v1.0/documents/{doc_id}/")
            assert r.status == 404

    run(go())
    assert not path.exists() and (trash / path.name).exists()
    assert server.library.get(doc_id) is None


def test_folders_are_real_folders(server):
    """Folders nest, hold documents, and are folders in the Finder."""
    root = server.library.documents_dir

    async def go():
        api = server.origin + "/api/v1.0/"
        async with ClientSession() as s:
            r = await s.post(api + "documents/", json={"title": "Projects",
                                                       "kind": "folder"})
            assert r.status == 201
            projects = await r.json()
            assert projects["kind"] == "folder"
            assert projects["abilities"]["children_create"] is True
            assert (root / "Projects").is_dir()

            r = await s.post(api + f"documents/{projects['id']}/children/",
                             json={"title": "2026", "kind": "folder"})
            year = await r.json()
            r = await s.post(api + f"documents/{year['id']}/children/",
                             json={"title": "Budget", "kind": "sheet"})
            budget = await r.json()
            assert (root / "Projects" / "2026" / "Budget.kdoc").is_file()
            # Documents hold nothing in the app.
            r = await s.post(api + f"documents/{budget['id']}/children/",
                             json={"title": "No"})
            assert r.status == 400

            top = await (await s.get(api + "documents/")).json()
            assert [d["title"] for d in top["results"]] == ["Projects"]
            assert top["results"][0]["numchild"] == 1
            inside = await (await s.get(
                api + f"documents/{year['id']}/children/")).json()
            assert [d["id"] for d in inside["results"]] == [budget["id"]]
            folders = await (await s.get(api + "documents/?kind=folder")).json()
            assert [d["title"] for d in folders["results"]] == ["Projects"]

            # The page tree, from the top folder down to the spreadsheet.
            tree = await (await s.get(
                api + f"documents/{budget['id']}/tree/")).json()
            assert tree["id"] == projects["id"]
            assert tree["children"][0]["id"] == year["id"]
            assert tree["children"][0]["children"][0]["id"] == budget["id"]

            # Renaming a folder renames it on disk; what is inside follows.
            r = await s.patch(api + f"documents/{projects['id']}/",
                              json={"title": "Work"})
            assert (await r.json())["title"] == "Work"
            assert (root / "Work" / "2026" / "Budget.kdoc").is_file()
            got = await (await s.get(api + f"documents/{budget['id']}/")).json()
            assert got["kind"] == "sheet"

            # Out to the top level (beside the top folder), then back in.
            r = await s.post(api + f"documents/{budget['id']}/move/",
                             json={"target_document_id": projects["id"],
                                   "position": "right"})
            assert r.status == 200
            assert (root / "Budget.kdoc").is_file()
            r = await s.post(api + f"documents/{budget['id']}/move/",
                             json={"target_document_id": projects["id"],
                                   "position": "first-child"})
            assert (root / "Work" / "Budget.kdoc").is_file()
            # A folder cannot go inside itself.
            r = await s.post(api + f"documents/{projects['id']}/move/",
                             json={"target_document_id": year["id"],
                                   "position": "last-child"})
            assert r.status == 400

    run(go())


def test_folders_made_in_the_finder_show_up(tmp_path):
    library = Library(tmp_path / "data", tmp_path / "Documents")
    doc_id = library.create("Plan")
    (tmp_path / "Documents" / "Clients" / "Acme").mkdir(parents=True)
    os.replace(library.get(doc_id).path,
               tmp_path / "Documents" / "Clients" / "Acme" / "Plan.kdoc")
    (tmp_path / "Documents" / ".hidden").mkdir()

    items = {i["title"]: i for i in library.items()}
    assert set(items) == {"Clients", "Acme", "Plan"}
    assert items["Plan"]["id"] == doc_id
    assert items["Plan"]["parent"] == items["Acme"]["id"]
    assert items["Acme"]["parent"] == items["Clients"]["id"]
    assert items["Clients"]["parent"] is None

    # Renamed in the Finder: the same folder (its id is inside it).
    acme = items["Acme"]["id"]
    os.rename(tmp_path / "Documents" / "Clients" / "Acme",
              tmp_path / "Documents" / "Clients" / "Acme Corp")
    items = {i["title"]: i for i in library.items()}
    assert items["Acme Corp"]["id"] == acme
    assert library.get(doc_id).path.parent.name == "Acme Corp"


def test_deleting_a_folder_moves_it_away(server, monkeypatch, tmp_path):
    import shutil

    from khervedoc_desktop.local import server as server_module
    trash = tmp_path / "Trash"
    trash.mkdir()
    monkeypatch.setattr(server_module, "_move_to_trash",
                        lambda p: bool(shutil.move(str(p), trash / p.name)))
    folder = server.library.create("Old", kind="folder")
    doc_id = server.library.create("Notes", parent=folder)

    async def go():
        async with ClientSession() as s:
            r = await s.delete(server.origin + f"/api/v1.0/documents/{folder}/")
            assert r.status == 204

    run(go())
    assert (trash / "Old" / "Notes.kdoc").is_file()
    assert server.library.get(doc_id) is None
    assert server.library.folder(folder) is None
