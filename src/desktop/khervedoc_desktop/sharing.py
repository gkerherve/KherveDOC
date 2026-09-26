"""Sharing between the documents on this computer and a KherveDOC server.

- *Share on KherveDOC*: a ``.kdoc`` document becomes a document on the
  server (content and images), where others can edit it with you live.
  The file remembers the link, so sharing it again opens that copy.
- *Save a Copy on this Mac*: a server document becomes a ``.kdoc`` file.

Images live apart from a document's content (in the ``.kdoc`` file, or in
the server's storage), so both directions upload the images and rewrite
their addresses inside the content.
"""

from __future__ import annotations

import base64
import json
import mimetypes
import re
import urllib.parse
import urllib.request
from pathlib import Path

from pycrdt import Doc, XmlElement, XmlFragment
from PySide6.QtCore import QSettings, QUrl
from PySide6.QtWidgets import (
    QDialog, QDialogButtonBox, QLabel, QLineEdit, QMessageBox, QVBoxLayout,
)

from khervedoc_desktop.kherve_doc import (
    CSRF_COOKIE, SESSION_COOKIE, KherveDoc, KherveDocError, NotSignedIn,
)

FRAGMENT = "document-store"
DEFAULT_SERVER = "http://localhost:3000"
LOCAL_MEDIA = re.compile(
    r"^(?:https?://127\.0\.0\.1:\d+)?/media/(?P<doc>[0-9a-f-]{36})/"
    r"(?P<key>[0-9a-f]{24}(?:\.\w{1,9})?)$")


# ── Images inside a document's content ───────────────────────────────
def _elements(node):
    for child in node.children:
        if isinstance(child, XmlElement):
            yield child
            yield from _elements(child)


def media_urls(state: bytes) -> list[str]:
    """Every file address (image, video, PDF…) the content refers to."""
    doc = Doc()
    doc.apply_update(state)
    urls = []
    for element in _elements(doc.get(FRAGMENT, type=XmlFragment)):
        url = element.attributes.get("url")
        if isinstance(url, str) and url and url not in urls:
            urls.append(url)
    return urls


def rewrite_media(state: bytes, mapping: dict[str, str]) -> bytes:
    """The content with file addresses replaced (old → new)."""
    doc = Doc()
    doc.apply_update(state)
    for element in _elements(doc.get(FRAGMENT, type=XmlFragment)):
        url = element.attributes.get("url")
        if url in mapping:
            element.attributes["url"] = mapping[url]
    return doc.get_update()


# ── Signing in ───────────────────────────────────────────────────────
def _settings() -> QSettings:
    return QSettings()


def saved_account() -> KherveDoc | None:
    s = _settings()
    server = s.value("sharing/server", "", type=str)
    if not server:
        return None
    return KherveDoc(server, session=s.value("sharing/session", "", type=str),
                     csrf=s.value("sharing/csrf", "", type=str))


def _remember(kd: KherveDoc) -> None:
    s = _settings()
    s.setValue("sharing/server", kd.server)
    s.setValue("sharing/session", kd.session)
    s.setValue("sharing/csrf", kd.csrf)


class _ServerDialog(QDialog):
    def __init__(self, server: str, text: str, parent=None):
        super().__init__(parent)
        self.setWindowTitle("KherveDOC server")
        label = QLabel(text)
        label.setWordWrap(True)
        self.address = QLineEdit(server)
        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Cancel)
        buttons.addButton("Continue", QDialogButtonBox.ButtonRole.AcceptRole)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout = QVBoxLayout(self)
        layout.addWidget(label)
        layout.addWidget(QLabel("KherveDOC address:"))
        layout.addWidget(self.address)
        layout.addWidget(buttons)
        self.resize(480, self.sizeHint().height())


class SignInDialog(QDialog):
    """The server's own sign-in page, in the app's browser storage (so the
    shared document then opens signed in)."""

    def __init__(self, kd: KherveDoc, profile, parent=None):
        super().__init__(parent)
        from PySide6.QtWebEngineCore import QWebEnginePage
        from PySide6.QtWebEngineWidgets import QWebEngineView
        self.kd = kd
        self.session = ""
        self.csrf = ""
        self.setWindowTitle("Sign in to KherveDOC")
        self.resize(560, 720)
        self._store = profile.cookieStore()
        self._store.cookieAdded.connect(self._on_cookie)
        self._store.loadAllCookies()
        self.view = QWebEngineView(self)
        self.page = QWebEnginePage(profile, self.view)
        self.view.setPage(self.page)
        self.page.urlChanged.connect(self._on_url)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.view)
        self.view.load(QUrl(kd.login_url()))

    def _on_cookie(self, cookie):
        name = bytes(cookie.name()).decode(errors="replace")
        value = bytes(cookie.value()).decode(errors="replace")
        host = cookie.domain().lstrip(".")
        if host and host != urllib.parse.urlsplit(self.kd.server).hostname:
            return
        if name == SESSION_COOKIE:
            self.session = value
        elif name == CSRF_COOKIE:
            self.csrf = value

    def _on_url(self, url: QUrl):
        if self.session and url.toString().startswith(self.kd.server):
            self.kd.session = self.session
            if self.csrf:
                self.kd.csrf = self.csrf
            try:
                self.kd.me()
            except KherveDocError:
                return
            self.accept()

    def done(self, result):
        try:
            self._store.cookieAdded.disconnect(self._on_cookie)
        except (RuntimeError, TypeError):
            pass
        self.view.setPage(None)
        self.page.deleteLater()
        super().done(result)


def signed_in(profile, parent=None, ask_address: bool = True) -> KherveDoc | None:
    """A KherveDOC server the user is signed in to (asking if needed)."""
    kd = saved_account()
    if kd is not None and kd.session:
        try:
            kd.me()
            return kd
        except NotSignedIn:
            pass
        except KherveDocError as exc:
            QMessageBox.warning(parent, "KherveDOC", str(exc))
            return None
    server = kd.server if kd else QSettings().value(
        "serverUrl", DEFAULT_SERVER, type=str)
    if ask_address:
        dialog = _ServerDialog(
            server, "Share through your KherveDOC server: the people you "
            "invite there can edit the document with you, live.", parent)
        if dialog.exec() != QDialog.DialogCode.Accepted:
            return None
        server = dialog.address.text().strip().rstrip("/") or DEFAULT_SERVER
    kd = KherveDoc(server)
    try:
        kd.discover()
    except KherveDocError as exc:
        QMessageBox.warning(parent, "Share on KherveDOC", str(exc))
        return None
    if SignInDialog(kd, profile, parent).exec() != QDialog.DialogCode.Accepted:
        return None
    _remember(kd)
    return kd


# ── Share: this computer → server ────────────────────────────────────
def share(kd: KherveDoc, local_server, library, doc_id: str) -> str:
    """Put a local document on the server; returns the server document's
    id (the one it was shared as before, if it still exists)."""
    file = library.get(doc_id)
    meta = local_server.call(file.meta)
    link = meta.get("shared") or {}
    if link.get("server") == kd.server and link.get("id"):
        try:
            kd.document(link["id"])
            return link["id"]
        except KherveDocError:
            pass   # deleted on the server: share it anew
    room = local_server.call(local_server.rooms.get, doc_id)
    state = local_server.call(room.state)
    created = kd.create_document(meta.get("title") or "Untitled",
                                 meta.get("kind") or "doc")
    server_id = created["id"]
    mapping = {}
    for url in media_urls(state):
        match = LOCAL_MEDIA.match(url)
        if not match or match["doc"] != doc_id:
            continue
        data = local_server.call(file.media, match["key"])
        if data is None:
            continue
        mapping[url] = kd.upload(
            server_id, match["key"], data,
            mimetypes.guess_type(match["key"])[0] or "application/octet-stream")
    kd.save_content(server_id, rewrite_media(state, mapping))
    local_server.call(file.update_meta,
                      shared={"server": kd.server, "id": server_id})
    return server_id


# ── Save a copy: server → this computer ──────────────────────────────
def _get(kd: KherveDoc, url: str) -> bytes:
    request = urllib.request.Request(url, headers={
        "Cookie": f"{SESSION_COOKIE}={kd.session}"})
    with urllib.request.urlopen(request, timeout=120) as resp:
        return resp.read()


def _final_media_url(kd: KherveDoc, url: str) -> str | None:
    """A just-uploaded file is first addressed through the server's check
    (while it is scanned); ask it where the file itself is."""
    if "/media-check/" not in url:
        return url
    try:
        answer = json.loads(_get(kd, url))
    except (OSError, ValueError):
        return None
    if answer.get("status") != "ready" or not answer.get("file"):
        return None
    base = (kd.config().get("MEDIA_BASE_URL") or kd.server).rstrip("/")
    return base + answer["file"] if answer["file"].startswith("/") \
        else answer["file"]


def _download(kd: KherveDoc, url: str) -> tuple[bytes, str] | None:
    """A file of the server document (its media is signed-in only)."""
    if url.startswith("/"):
        url = kd.server + url
    url = _final_media_url(kd, url)
    if url is None:
        return None
    if not url.startswith(("http://", "https://")):
        return None
    try:
        data = _get(kd, url)
    except OSError:
        return None
    return data, Path(urllib.parse.urlsplit(url).path).name or "file"


def save_copy(kd: KherveDoc, local_server, library, server_id: str) -> str:
    """A ``.kdoc`` copy of a server document; returns its local id."""
    info = kd.document(server_id)
    state = kd.content(server_id) or b""
    doc_id = library.create(title=info.get("title") or "",
                            kind=info.get("kind") or "doc")
    file = library.get(doc_id)
    mapping = {}
    for url in media_urls(state):
        if LOCAL_MEDIA.match(url):
            continue
        got = _download(kd, url)
        if got is None:
            continue
        data, name = got
        key = local_server.call(file.add_media, name, data)
        mapping[url] = f"/media/{doc_id}/{key}"
    content = rewrite_media(state, mapping) if mapping else state
    local_server.call(file.write_content, content)
    local_server.call(file.update_meta,
                      shared={"server": kd.server, "id": server_id})
    return doc_id


def encode(state: bytes) -> str:
    return base64.b64encode(state).decode()
