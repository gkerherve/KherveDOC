"""Documents on disk for the standalone KherveDOC app.

A document is one ``.kdoc`` file: a ZIP archive holding

- ``meta.json``   — ``{"id", "title", "kind", "created_at", "updated_at"}``
- ``content.bin`` — the document's Yjs state (what the editor edits)
- ``media/<key>`` — images and files inserted in the document

The library remembers which files the app knows (a JSON list in the app's
data folder), so the home screen can list them and the editor can find a
document by its id.
"""

from __future__ import annotations

import json
import mimetypes
import os
import re
import secrets
import tempfile
import threading
import uuid
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

EXTENSION = ".kdoc"
KINDS = ("doc", "sheet")

META = "meta.json"
CONTENT = "content.bin"
MEDIA = "media/"


def _umask() -> int:
    mask = os.umask(0)
    os.umask(mask)
    return mask


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _safe_name(name: str) -> str:
    """A file name part without characters macOS/Windows refuse."""
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "-", name).strip(" .")
    return name[:120] or "Untitled"


@dataclass
class DocFile:
    """One ``.kdoc`` file."""

    path: Path

    # ── Reading ──────────────────────────────────────────────────────
    def meta(self) -> dict:
        with zipfile.ZipFile(self.path) as z:
            return json.loads(z.read(META))

    def content(self) -> bytes:
        with zipfile.ZipFile(self.path) as z:
            try:
                return z.read(CONTENT)
            except KeyError:
                return b""

    def media(self, key: str) -> bytes | None:
        with zipfile.ZipFile(self.path) as z:
            try:
                return z.read(MEDIA + key)
            except KeyError:
                return None

    # ── Writing (the whole archive is rewritten, atomically) ─────────
    def _rewrite(self, meta: dict | None = None,
                 content: bytes | None = None,
                 add_media: dict[str, bytes] | None = None) -> None:
        old = zipfile.ZipFile(self.path) if self.path.exists() else None
        fd, tmp = tempfile.mkstemp(prefix=".kdoc-", dir=self.path.parent)
        os.close(fd)
        # mkstemp makes the file private; keep the usual file permissions.
        mode = (self.path.stat().st_mode & 0o777) if self.path.exists() \
            else (0o666 & ~_umask())
        os.chmod(tmp, mode)
        try:
            with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
                current_meta = meta
                if current_meta is None and old is not None:
                    current_meta = json.loads(old.read(META))
                z.writestr(META, json.dumps(current_meta, indent=1))
                if content is not None:
                    z.writestr(CONTENT, content)
                elif old is not None and CONTENT in old.namelist():
                    z.writestr(CONTENT, old.read(CONTENT))
                if old is not None:
                    for name in old.namelist():
                        if name.startswith(MEDIA):
                            z.writestr(name, old.read(name))
                for key, data in (add_media or {}).items():
                    z.writestr(MEDIA + key, data)
            if old is not None:
                old.close()
                old = None
            os.replace(tmp, self.path)
        finally:
            if old is not None:
                old.close()
            if os.path.exists(tmp):
                os.unlink(tmp)

    def create(self, meta: dict) -> None:
        self._rewrite(meta=meta, content=b"")

    def write_content(self, content: bytes) -> None:
        meta = self.meta()
        meta["updated_at"] = now_iso()
        self._rewrite(meta=meta, content=content)

    def update_meta(self, **changes) -> dict:
        meta = self.meta()
        meta.update(changes)
        meta["updated_at"] = now_iso()
        self._rewrite(meta=meta)
        return meta

    def add_media(self, filename: str, data: bytes) -> str:
        """Store a file; returns its key (unique, keeps the extension)."""
        suffix = Path(filename).suffix.lower()[:10]
        key = f"{secrets.token_hex(12)}{suffix}"
        self._rewrite(add_media={key: data})
        return key


def media_type(key: str) -> str:
    return mimetypes.guess_type(key)[0] or "application/octet-stream"


class Library:
    """The documents the app knows, by id."""

    def __init__(self, data_dir: Path, documents_dir: Path):
        self.data_dir = Path(data_dir)
        self.documents_dir = Path(documents_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._index_path = self.data_dir / "library.json"
        self._lock = threading.RLock()
        self._paths: dict[str, str] = {}
        if self._index_path.exists():
            try:
                self._paths = json.loads(self._index_path.read_text())["paths"]
            except (ValueError, KeyError, OSError):
                self._paths = {}

    def _save_index(self) -> None:
        tmp = self._index_path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"paths": self._paths}, indent=1))
        os.replace(tmp, self._index_path)

    # ── Lookup ───────────────────────────────────────────────────────
    def get(self, doc_id: str) -> DocFile | None:
        with self._lock:
            path = self._paths.get(doc_id)
        if not path or not Path(path).exists():
            return None
        return DocFile(Path(path))

    def entries(self) -> list[dict]:
        """Every known document that still exists: its meta and path."""
        with self._lock:
            items = list(self._paths.items())
        found = []
        for doc_id, path in items:
            try:
                meta = DocFile(Path(path)).meta()
            except (OSError, ValueError, KeyError, zipfile.BadZipFile):
                continue
            meta["id"] = doc_id
            meta["path"] = path
            found.append(meta)
        return found

    # ── Adding documents ─────────────────────────────────────────────
    def _free_path(self, title: str, folder: Path) -> Path:
        base = _safe_name(title)
        path = folder / f"{base}{EXTENSION}"
        n = 2
        while path.exists():
            path = folder / f"{base} {n}{EXTENSION}"
            n += 1
        return path

    def create(self, title: str = "", kind: str = "doc",
               path: Path | None = None) -> str:
        """A new, empty document file; returns its id."""
        if kind not in KINDS:
            kind = "doc"
        default = "Untitled spreadsheet" if kind == "sheet" \
            else "Untitled document"
        self.documents_dir.mkdir(parents=True, exist_ok=True)
        path = Path(path) if path else self._free_path(
            title or default, self.documents_dir)
        doc_id = str(uuid.uuid4())
        stamp = now_iso()
        DocFile(path).create({"id": doc_id, "title": title, "kind": kind,
                              "created_at": stamp, "updated_at": stamp})
        with self._lock:
            self._paths[doc_id] = str(path)
            self._save_index()
        return doc_id

    def open_path(self, path: Path) -> str:
        """Register an existing ``.kdoc`` file; returns its id.

        A copy of a file the library already knows (same id, other path)
        gets a new id, so both can be open at once."""
        path = Path(path).resolve()
        doc = DocFile(path)
        meta = doc.meta()
        doc_id = meta.get("id") or str(uuid.uuid4())
        with self._lock:
            known = self._paths.get(doc_id)
            if known and Path(known).resolve() != path \
                    and Path(known).exists():
                doc_id = str(uuid.uuid4())
                doc.update_meta(id=doc_id)
            elif meta.get("id") != doc_id:
                doc.update_meta(id=doc_id)
            self._paths[doc_id] = str(path)
            self._save_index()
        return doc_id

    def is_auto_named(self, doc_id: str) -> bool:
        """Still "Untitled document…" in the documents folder: the name
        the app chose, which the document's title may replace."""
        file = self.get(doc_id)
        if file is None:
            return False
        path = file.path.resolve()
        return (path.parent == self.documents_dir.resolve()
                and re.fullmatch(r"Untitled (document|spreadsheet)( \d+)?",
                                 path.stem) is not None)

    def rename_to_title(self, doc_id: str, title: str) -> Path | None:
        """Give an auto-named file its document's title; returns the new
        path (None when it keeps its name)."""
        if not title.strip() or not self.is_auto_named(doc_id):
            return None
        old = self.get(doc_id).path
        new = self._free_path(title, old.parent)
        os.replace(old, new)
        self.move(doc_id, new)
        return new

    def move(self, doc_id: str, new_path: Path) -> None:
        """Point a document at another file (after Save As)."""
        with self._lock:
            self._paths[doc_id] = str(Path(new_path).resolve())
            self._save_index()

    def forget(self, doc_id: str) -> None:
        with self._lock:
            self._paths.pop(doc_id, None)
            self._save_index()
