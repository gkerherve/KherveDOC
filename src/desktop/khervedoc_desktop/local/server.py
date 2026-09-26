"""The standalone app's own KherveDOC server, on 127.0.0.1 only.

It serves the KherveDOC web app (the static build bundled with the desktop
app) and answers, from ``.kdoc`` files, the few API calls the editor needs:
settings, the user, documents and their content, image uploads, and the
live collaboration socket (Hocuspocus, see rooms.py). Everything else in
the API answers "nothing here", and the document abilities keep the
server-only features (sharing, page tree, history, AI) hidden.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import getpass
import json
import logging
import mimetypes
import os
import re
import socket
import threading
import uuid
from pathlib import Path

from aiohttp import ClientSession, ClientTimeout, WSMsgType, web

from .rooms import Client, Rooms
from .store import Library, media_type, now_iso

log = logging.getLogger(__name__)

API = "/api/v1.0/"
UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
DOC_PAGE = re.compile(rf"^/docs/({UUID})/?$")
LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001"
DEFAULT_PORT = 38471
#: Where Pyodide (the spreadsheets' Python) comes from the first time; the
#: app keeps a copy, so spreadsheets then work offline.
PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/"
PYODIDE_FILE = re.compile(r"^[\w.+-]+$")
mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("text/javascript", ".mjs")

CONFIG_TEMPLATE = json.loads(
    (Path(__file__).with_name("config_template.json")).read_text())


def _local_user(language: str = "en-us") -> dict:
    try:
        name = getpass.getuser()
    except Exception:
        name = "Me"
    return {"id": LOCAL_USER_ID, "email": "", "full_name": name,
            "short_name": name, "language": language,
            "is_first_connection": False}


def doc_json(meta: dict) -> dict:
    """A document as the web app expects it (see Doc in types.tsx): the
    owner of a private document, with only what works locally allowed."""
    abilities = {name: False for name in (
        "accesses_manage", "accesses_view", "ai_proxy", "ai_transform",
        "ai_translate", "children_create", "children_list",
        "collaboration_auth", "comment", "cors_proxy", "descendants",
        "destroy", "duplicate", "favorite", "invite_owner", "leave",
        "link_configuration", "move", "restore", "search", "tree",
        "versions_destroy", "versions_list", "versions_retrieve",
        "media_check")}
    abilities.update({name: True for name in (
        "retrieve", "update", "partial_update", "content_retrieve",
        "content_patch", "formatted_content", "attachment_upload",
        "media_auth", "can_edit")})
    abilities["link_select_options"] = {"restricted": None,
                                        "authenticated": [], "public": []}
    return {
        "id": meta["id"], "title": meta.get("title") or None,
        "kind": meta.get("kind") or "doc", "abilities": abilities,
        "ancestors_link_reach": None, "ancestors_link_role": None,
        "computed_link_reach": "restricted", "computed_link_role": None,
        "created_at": meta.get("created_at") or now_iso(),
        "updated_at": meta.get("updated_at") or now_iso(),
        "creator": LOCAL_USER_ID, "deleted_at": None, "depth": 1,
        "excerpt": None, "is_favorite": False, "link_reach": "restricted",
        "link_role": "reader", "nb_accesses_ancestors": 1,
        "nb_accesses_direct": 1, "numchild": 0,
        "path": "0000000", "user_role": "owner",
    }


class LocalServer:
    """Runs on its own thread with its own asyncio loop."""

    def __init__(self, library: Library, static_dir: Path,
                 app_version: str, port: int = DEFAULT_PORT,
                 pyodide_dir: Path | None = None,
                 bundled_pyodide: Path | None = None):
        self.library = library
        self.pyodide_dir = Path(pyodide_dir or library.data_dir / "pyodide-0.28.3")
        self.bundled_pyodide = bundled_pyodide
        self._fetching: dict[str, asyncio.Lock] = {}
        self.static_dir = Path(static_dir)
        self.app_version = app_version
        self.port = port
        self.rooms = Rooms(library)
        self.language = "en-us"
        self._loop: asyncio.AbstractEventLoop | None = None
        self._runner: web.AppRunner | None = None
        self._ready = threading.Event()
        self._sockets: set[web.WebSocketResponse] = set()
        self._error: BaseException | None = None

    # ── Addresses ────────────────────────────────────────────────────
    @property
    def origin(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def doc_url(self, doc_id: str) -> str:
        return f"{self.origin}/docs/{doc_id}/"

    # ── Lifecycle ────────────────────────────────────────────────────
    @staticmethod
    def _port_free(port: int) -> bool:
        with socket.socket() as probe:
            try:
                probe.bind(("127.0.0.1", port))
                return True
            except OSError:
                return False

    def start(self) -> str:
        """Start serving; returns the origin. The usual port is kept when
        free, so the web app's browser storage stays the same."""
        if not self.port or not self._port_free(self.port):
            with socket.socket() as probe:
                probe.bind(("127.0.0.1", 0))
                self.port = probe.getsockname()[1]
        thread = threading.Thread(target=self._run, name="kherve-local",
                                  daemon=True)
        thread.start()
        self._ready.wait(15)
        if self._error:
            raise RuntimeError(f"Local server failed: {self._error}")
        return self.origin

    def _run(self) -> None:
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        try:
            self._runner = web.AppRunner(self._app(), access_log=None,
                                         shutdown_timeout=1.0)
            self._loop.run_until_complete(self._runner.setup())
            site = web.TCPSite(self._runner, "127.0.0.1", self.port)
            self._loop.run_until_complete(site.start())
        except BaseException as exc:  # noqa: BLE001 - reported to start()
            self._error = exc
            self._ready.set()
            return
        self._ready.set()
        self._loop.run_forever()

    def call(self, fn, *args, **kwargs):
        """Run *fn* on the server's loop (from the Qt thread) and wait."""
        if self._loop is None:
            return fn(*args, **kwargs)
        future = asyncio.run_coroutine_threadsafe(
            self._as_coro(fn, *args, **kwargs), self._loop)
        return future.result(30)

    @staticmethod
    async def _as_coro(fn, *args, **kwargs):
        return fn(*args, **kwargs)

    def stop(self) -> None:
        if self._loop is None:
            return
        try:
            self.call(self.rooms.flush_all)
        except Exception:
            log.exception("Saving on quit failed")
        try:
            asyncio.run_coroutine_threadsafe(
                self._shutdown(), self._loop).result(5)
        except Exception:  # quitting anyway: everything is saved
            log.exception("Local server shutdown")
        self._loop.call_soon_threadsafe(self._loop.stop)

    async def _shutdown(self) -> None:
        # Open editors keep their live connection; close them first, or
        # the server waits for them.
        for sock in list(self._sockets):
            await sock.close()
        if self._runner is not None:
            await self._runner.cleanup()

    # ── Routes ───────────────────────────────────────────────────────
    def _app(self) -> web.Application:
        app = web.Application(client_max_size=64 * 1024 * 1024)
        r = app.router
        r.add_get("/collaboration/ws/", self.ws)
        r.add_get(API + "config/", self.config)
        r.add_get(API + "users/me/", self.me)
        r.add_patch(API + "users/{uid}/", self.update_user)
        r.add_get(API + "documents/", self.list_docs)
        r.add_post(API + "documents/", self.create_doc)
        r.add_get(API + "documents/search/", self.search_docs)
        r.add_get(API + "documents/{id}/", self.get_doc)
        r.add_patch(API + "documents/{id}/", self.update_doc)
        r.add_get(API + "documents/{id}/content/", self.get_content)
        r.add_patch(API + "documents/{id}/content/", self.put_content)
        r.add_get(API + "documents/{id}/can-edit/", self.can_edit)
        r.add_post(API + "documents/{id}/attachment-upload/", self.upload)
        r.add_get(API + "documents/{id}/tree/", self.tree)
        r.add_get(API + "documents/{id}/threads/", self.empty_list)
        r.add_get(API + "documents/{id}/children/", self.empty_page)
        r.add_get(API + "documents/{id}/accesses/", self.empty_list)
        r.add_get(API + "documents/{id}/invitations/", self.empty_page)
        r.add_get(API + "documents/{id}/versions/", self.empty_page)
        r.add_get("/media/{id}/{key}", self.media)
        r.add_get("/kherve-cell/pyodide/{name}", self.pyodide)
        r.add_route("*", API + "{tail:.*}", self.not_here)
        r.add_get("/{tail:.*}", self.static)
        return app

    # ── Web app files ────────────────────────────────────────────────
    async def static(self, request: web.Request) -> web.StreamResponse:
        path = request.path
        if DOC_PAGE.match(path):
            return self._file("docs/[id]/index.html")
        rel = path.lstrip("/")
        target = (self.static_dir / rel).resolve()
        if not str(target).startswith(str(self.static_dir.resolve())):
            raise web.HTTPNotFound()
        if target.is_dir():
            target = target / "index.html"
        if target.is_file():
            return web.FileResponse(target)
        if (self.static_dir / (rel.rstrip("/") + ".html")).is_file():
            return web.FileResponse(self.static_dir / (rel.rstrip("/")
                                                       + ".html"))
        return self._file("404.html", status=404)

    def _file(self, rel: str, status: int = 200) -> web.StreamResponse:
        target = self.static_dir / rel
        if not target.is_file():
            return web.Response(status=404, text="Not found")
        return web.FileResponse(target, status=status)

    # ── Settings and user ────────────────────────────────────────────
    async def config(self, request: web.Request) -> web.Response:
        conf = dict(CONFIG_TEMPLATE)
        conf.update({
            "COLLABORATION_WS_URL":
                f"ws://127.0.0.1:{self.port}/collaboration/ws/",
            "COLLABORATION_WS_NOT_CONNECTED_READ_ONLY": False,
            "COLLABORATION_WS_INACTIVITY_TIMEOUT": None,
            "CONVERSION_UPLOAD_ENABLED": False,
            "FRONTEND_HOMEPAGE_FEATURE_ENABLED": False,
            "FRONTEND_SILENT_LOGIN_ENABLED": False,
            "AI_FEATURE_ENABLED": False,
            "AI_FEATURE_BLOCKNOTE_ENABLED": False,
            "AI_FEATURE_LEGACY_ENABLED": False,
            "MEDIA_BASE_URL": self.origin,
            "ENVIRONMENT": "desktop",
            "POSTHOG_KEY": None,
            "SENTRY_DSN": None,
            "RELEASE_VERSION": self.app_version,
            "KHERVE_LOCAL": True,
        })
        return web.json_response(conf)

    async def me(self, request: web.Request) -> web.Response:
        return web.json_response(_local_user(self.language))

    async def update_user(self, request: web.Request) -> web.Response:
        body = await request.json()
        if isinstance(body.get("language"), str):
            self.language = body["language"]
        return web.json_response(_local_user(self.language))

    # ── Documents ────────────────────────────────────────────────────
    def _meta(self, doc_id: str) -> dict:
        file = self.library.get(doc_id)
        if file is None:
            raise web.HTTPNotFound(
                text=json.dumps({"detail": "Not found."}),
                content_type="application/json")
        meta = file.meta()
        meta["id"] = doc_id
        return meta

    async def list_docs(self, request: web.Request) -> web.Response:
        q = request.query
        entries = self.library.entries()
        title = (q.get("title") or "").lower()
        if title:
            entries = [e for e in entries
                       if title in (e.get("title") or "").lower()]
        if q.get("is_favorite") in ("true", "1"):
            entries = []
        ordering = q.get("ordering", "-updated_at")
        key = ordering.lstrip("-")
        if key not in ("updated_at", "created_at", "title"):
            key = "updated_at"
        entries.sort(key=lambda e: (e.get(key) or ""),
                     reverse=ordering.startswith("-"))
        size = max(1, min(int(q.get("page_size") or 20), 200))
        page = max(1, int(q.get("page") or 1))
        chunk = entries[(page - 1) * size:page * size]
        more = page * size < len(entries)
        next_url = None
        if more:
            params = dict(q)
            params["page"] = str(page + 1)
            next_url = str(request.url.with_query(params))
        return web.json_response({
            "count": len(entries), "next": next_url,
            "previous": None, "results": [doc_json(e) for e in chunk]})

    async def search_docs(self, request: web.Request) -> web.Response:
        """Search the documents on this computer by title."""
        q = (request.query.get("q") or "").strip().lower()
        entries = [e for e in self.library.entries()
                   if not q or q in (e.get("title") or "").lower()]
        entries.sort(key=lambda e: e.get("updated_at") or "", reverse=True)
        return web.json_response({
            "count": len(entries), "next": None, "previous": None,
            "results": [doc_json(e) for e in entries[:50]]})

    async def create_doc(self, request: web.Request) -> web.Response:
        body = {}
        if request.content_type == "application/json":
            body = await request.json()
        doc_id = self.library.create(title=body.get("title") or "",
                                     kind=body.get("kind") or "doc")
        return web.json_response(doc_json(self._meta(doc_id)), status=201)

    async def get_doc(self, request: web.Request) -> web.Response:
        return web.json_response(doc_json(self._meta(request.match_info["id"])))

    async def update_doc(self, request: web.Request) -> web.Response:
        doc_id = request.match_info["id"]
        self._meta(doc_id)
        body = await request.json()
        changes = {}
        if "title" in body:
            changes["title"] = body["title"] or ""
        meta = self.library.get(doc_id).update_meta(**changes)
        meta["id"] = doc_id
        if changes.get("title"):
            room = self.rooms.get(doc_id)
            if room is not None:
                room.flush()
            if self.library.rename_to_title(doc_id, changes["title"]):
                self.rooms.relocate(doc_id)
        return web.json_response(doc_json(meta))

    async def get_content(self, request: web.Request) -> web.Response:
        doc_id = request.match_info["id"]
        self._meta(doc_id)
        room = self.rooms.get(doc_id)
        state = room.state() if room else b""
        return web.Response(text=base64.b64encode(state).decode(),
                            content_type="text/plain")

    async def put_content(self, request: web.Request) -> web.Response:
        doc_id = request.match_info["id"]
        self._meta(doc_id)
        body = await request.json()
        try:
            update = base64.b64decode(body.get("content") or "",
                                      validate=True)
        except (binascii.Error, ValueError):
            raise web.HTTPBadRequest(text="content is not base64")
        room = self.rooms.get(doc_id)
        if update and room is not None:
            room.apply(update)
            room.flush()
        return web.json_response({"id": doc_id})

    async def can_edit(self, request: web.Request) -> web.Response:
        return web.json_response({"can_edit": True})

    async def tree(self, request: web.Request) -> web.Response:
        meta = self._meta(request.match_info["id"])
        node = doc_json(meta)
        node.update({"children": [], "numchild": 0})
        return web.json_response(node)

    async def upload(self, request: web.Request) -> web.Response:
        doc_id = request.match_info["id"]
        self._meta(doc_id)
        reader = await request.multipart()
        async for part in reader:
            if part.name == "file":
                data = await part.read(decode=False)
                room = self.rooms.get(doc_id)
                if room is not None:
                    room.flush()
                key = self.library.get(doc_id).add_media(
                    part.filename or "file", bytes(data))
                return web.json_response(
                    {"file": f"/media/{doc_id}/{key}"}, status=201)
        raise web.HTTPBadRequest(text="no file")

    async def media(self, request: web.Request) -> web.Response:
        doc_id, key = request.match_info["id"], request.match_info["key"]
        file = self.library.get(doc_id)
        if file is None or not re.fullmatch(r"[0-9a-f]{24}(\.\w{1,9})?", key):
            raise web.HTTPNotFound()
        data = file.media(key)
        if data is None:
            raise web.HTTPNotFound()
        return web.Response(body=data, content_type=media_type(key),
                            headers={"Cache-Control": "max-age=31536000"})

    # ── Pyodide (spreadsheets), kept on this computer ────────────────
    async def pyodide(self, request: web.Request) -> web.StreamResponse:
        name = request.match_info["name"]
        if not PYODIDE_FILE.match(name):
            raise web.HTTPNotFound()
        for folder in (self.bundled_pyodide, self.pyodide_dir):
            if folder is not None and (Path(folder) / name).is_file():
                return web.FileResponse(Path(folder) / name)
        lock = self._fetching.setdefault(name, asyncio.Lock())
        async with lock:
            target = self.pyodide_dir / name
            if not target.is_file():
                try:
                    await self._download(PYODIDE_CDN + name, target)
                except Exception as exc:  # offline, not on the CDN…
                    log.info("Pyodide %s unavailable: %s", name, exc)
                    raise web.HTTPNotFound()
        return web.FileResponse(target)

    @staticmethod
    async def _download(url: str, target: Path) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        timeout = ClientTimeout(total=600)
        async with ClientSession(timeout=timeout) as session:
            async with session.get(url) as response:
                if response.status != 200:
                    raise OSError(f"{url}: HTTP {response.status}")
                tmp = target.with_name(target.name + ".part")
                with open(tmp, "wb") as out:
                    async for chunk in response.content.iter_chunked(1 << 16):
                        out.write(chunk)
        os.replace(tmp, target)

    async def empty_list(self, request: web.Request) -> web.Response:
        return web.json_response([])

    async def empty_page(self, request: web.Request) -> web.Response:
        return web.json_response({"count": 0, "next": None,
                                  "previous": None, "results": []})

    async def not_here(self, request: web.Request) -> web.Response:
        return web.json_response(
            {"detail": "Not available in the KherveDOC app."}, status=404)

    # ── Live collaboration ───────────────────────────────────────────
    async def ws(self, request: web.Request) -> web.WebSocketResponse:
        doc_id = request.query.get("room", "")
        sock = web.WebSocketResponse(max_msg_size=64 * 1024 * 1024)
        await sock.prepare(request)
        room = self.rooms.get(doc_id) if re.fullmatch(UUID, doc_id) else None
        if room is None:
            await sock.close(code=4404, message=b"Unknown document")
            return sock
        client = Client(sock.send_bytes)
        room.join(client)
        self._sockets.add(sock)
        try:
            async for msg in sock:
                if msg.type == WSMsgType.BINARY:
                    await room.receive(client, msg.data)
                elif msg.type == WSMsgType.ERROR:
                    break
        finally:
            self._sockets.discard(sock)
            room.leave(client)
            room.flush()
        return sock


def new_uuid() -> str:
    return str(uuid.uuid4())
