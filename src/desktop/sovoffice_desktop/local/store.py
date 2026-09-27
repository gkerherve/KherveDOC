"""Documents on disk for the standalone Sovereign Office app.

A document is one ``.kdoc`` file: a ZIP archive holding

- ``meta.json``   — ``{"id", "title", "kind", "created_at", "updated_at"}``
- ``content.bin`` — the document's Yjs state (what the editor edits)
- ``media/<key>`` — images and files inserted in the document

The library remembers which files the app knows (a JSON list in the app's
data folder), so the home screen can list them and the editor can find a
document by its id.

Folders are real folders inside the documents folder (``~/Documents/
Sovereign Office``), nested as deep as one likes. Each holds a small hidden file,
``.kherve-folder``, with the folder's id, so it keeps that id when renamed
or moved in the Finder. Folders and documents made or moved in the Finder
show up in the app too: the library looks through the documents folder
whenever it lists what is there.
"""

from __future__ import annotations

import json
import mimetypes
import os
import re
import secrets
import shutil
import tempfile
import threading
import uuid
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

EXTENSION = ".kdoc"
KINDS = ("doc", "sheet", "slide", "note", "chat", "meet")
UNTITLED = {"doc": "Untitled document", "sheet": "Untitled spreadsheet",
            "slide": "Untitled slides", "note": "Untitled note",
            "chat": "Untitled chat", "meet": "Untitled meeting"}
FOLDER = "folder"
FOLDER_MARK = ".kherve-folder"
#: Where documents deleted without a system Trash go (see server.py).
DELETED = "Deleted"

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


def _mtime_iso(path: Path) -> str:
    stamp = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
    return stamp.isoformat().replace("+00:00", "Z")


def _listed(path: Path) -> bool:
    """Shown in the app: not hidden, not the Deleted folder."""
    return not path.name.startswith(".") and path.name != DELETED


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
    """The documents and folders the app knows, by id."""

    def __init__(self, data_dir: Path, documents_dir: Path):
        self.data_dir = Path(data_dir)
        self.documents_dir = Path(documents_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._index_path = self.data_dir / "library.json"
        self._lock = threading.RLock()
        self._paths: dict[str, str] = {}
        self._folders: dict[str, str] = {}
        if self._index_path.exists():
            try:
                index = json.loads(self._index_path.read_text())
                self._paths = index["paths"]
                self._folders = index.get("folders", {})
            except (ValueError, KeyError, OSError):
                self._paths, self._folders = {}, {}

    def _save_index(self) -> None:
        tmp = self._index_path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"paths": self._paths,
                                   "folders": self._folders}, indent=1))
        os.replace(tmp, self._index_path)

    @property
    def _root(self) -> Path:
        return self.documents_dir.resolve()

    # ── Lookup ───────────────────────────────────────────────────────
    def get(self, doc_id: str) -> DocFile | None:
        with self._lock:
            path = self._paths.get(doc_id)
        if not path or not Path(path).exists():
            return None
        return DocFile(Path(path))

    def folder(self, folder_id: str) -> Path | None:
        with self._lock:
            path = self._folders.get(folder_id)
        if not path or not Path(path).is_dir():
            return None
        return Path(path)

    def parent_of(self, path: Path) -> str | None:
        """The id of the folder holding *path*; None at the top level
        (the documents folder itself, or a file elsewhere on the Mac)."""
        parent = Path(path).resolve().parent
        root = self._root
        if parent == root or root not in parent.parents:
            return None
        return self._folder_id(parent)

    def entries(self) -> list[dict]:
        """Every known document that still exists: its meta, path and
        the folder holding it."""
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
            meta["parent"] = self.parent_of(Path(path))
            found.append(meta)
        return found

    def folder_meta(self, folder_id: str) -> dict | None:
        """A folder described like a document: its name is its title."""
        path = self.folder(folder_id)
        if path is None:
            return None
        mark = _read_mark(path) or {}
        return {"id": folder_id, "title": path.name, "kind": FOLDER,
                "created_at": mark.get("created_at") or _mtime_iso(path),
                "updated_at": _mtime_iso(path), "path": str(path),
                "parent": self.parent_of(path)}

    def folder_entries(self) -> list[dict]:
        with self._lock:
            ids = list(self._folders)
        return [meta for meta in map(self.folder_meta, ids) if meta]

    def items(self) -> list[dict]:
        """Every folder and document, after looking through the
        documents folder for what changed there."""
        self.scan()
        return self.folder_entries() + self.entries()

    def inside(self, folder_id: str) -> tuple[list[str], list[str]]:
        """The ids of the documents and of the folders anywhere inside a
        folder."""
        path = self.folder(folder_id)
        if path is None:
            return [], []
        prefix = str(path) + os.sep
        with self._lock:
            docs = [i for i, p in self._paths.items() if p.startswith(prefix)]
            folders = [i for i, p in self._folders.items()
                       if p.startswith(prefix)]
        return docs, folders

    # ── Folders on disk ──────────────────────────────────────────────
    def _folder_id(self, folder: Path) -> str:
        """The id of a folder inside the documents folder (given one the
        first time it is seen; a copy made in the Finder gets its own)."""
        folder = folder.resolve()
        folder_id = (_read_mark(folder) or {}).get("id")
        with self._lock:
            known = self._folders.get(folder_id) if folder_id else None
            if known and known != str(folder) and Path(known).is_dir() \
                    and (_read_mark(Path(known)) or {}).get("id") == folder_id:
                folder_id = None
            if not folder_id:
                folder_id = str(uuid.uuid4())
                (folder / FOLDER_MARK).write_text(json.dumps(
                    {"id": folder_id, "created_at": now_iso()}))
            if self._folders.get(folder_id) != str(folder):
                self._folders[folder_id] = str(folder)
                self._save_index()
        return folder_id

    def scan(self) -> None:
        """Take in the folders and documents in the documents folder,
        those made or moved in the Finder included."""
        root = self._root
        if not root.is_dir():
            return
        with self._lock:
            known = {str(Path(p).resolve()) for p in self._paths.values()}
        for here, dirs, files in os.walk(root):
            dirs[:] = sorted(d for d in dirs if _listed(Path(d)))
            here = Path(here)
            if here != root:
                self._folder_id(here)
            for name in files:
                path = here / name
                if not name.lower().endswith(EXTENSION) or not _listed(path) \
                        or str(path) in known:
                    continue
                try:
                    self.open_path(path)
                except (OSError, ValueError, KeyError, zipfile.BadZipFile):
                    continue
        with self._lock:
            gone = [i for i, p in self._folders.items() if not Path(p).is_dir()]
            for folder_id in gone:
                del self._folders[folder_id]
            if gone:
                self._save_index()

    def create_folder(self, title: str = "", parent: str | None = None) -> str:
        """A new folder (in *parent*, else at the top); returns its id."""
        base = self._container(parent)
        base.mkdir(parents=True, exist_ok=True)
        path = self._free_path(title or "New folder", base, suffix="")
        path.mkdir()
        return self._folder_id(path)

    def rename_folder(self, folder_id: str, title: str) -> list[str]:
        """Rename a folder after its new title; returns the ids of the
        documents inside, whose files have moved with it."""
        old = self.folder(folder_id)
        if old is None or not title.strip() or _safe_name(title) == old.name:
            return []
        new = self._free_path(title, old.parent, suffix="")
        os.rename(old, new)
        return self._relocated(old, new)

    def move_item(self, item_id: str, parent: str | None) -> list[str]:
        """Put a document or a folder in folder *parent* (None: the top
        level); returns the ids of the documents whose files moved."""
        target = self._container(parent).resolve()
        folder = self.folder(item_id)
        if folder is not None:
            if target == folder or folder in target.parents:
                raise ValueError("A folder cannot go inside itself.")
            if folder.parent == target:
                return []
            new = self._free_path(folder.name, target, suffix="")
            shutil.move(str(folder), str(new))
            return self._relocated(folder, new)
        file = self.get(item_id)
        if file is None:
            raise KeyError(item_id)
        if self.parent_of(file.path) == parent:
            return []
        target.mkdir(parents=True, exist_ok=True)
        new = self._free_path(file.path.stem, target)
        shutil.move(str(file.path), str(new))
        self.move(item_id, new)
        return [item_id]

    def add_examples(self, source: Path, name: str = "Examples") -> str:
        """Copy the examples (a folder of .kdoc files in sub-folders) into
        the documents folder; returns the new folder's id. The copies get
        ids of their own, so the examples can be added more than once."""
        self.documents_dir.mkdir(parents=True, exist_ok=True)
        target = self._free_path(name, self.documents_dir, suffix="")
        shutil.copytree(source, target, ignore=shutil.ignore_patterns(".*"))
        for path in sorted(target.rglob("*" + EXTENSION)):
            DocFile(path).update_meta(id=str(uuid.uuid4()))
        self.scan()
        return self._folder_id(target)

    def forget_folder(self, folder_id: str) -> None:
        """Forget a folder and everything in it (it went to the Trash)."""
        docs, folders = self.inside(folder_id)
        with self._lock:
            for doc_id in docs:
                self._paths.pop(doc_id, None)
            for inner in folders + [folder_id]:
                self._folders.pop(inner, None)
            self._save_index()

    def _container(self, parent: str | None) -> Path:
        if not parent:
            return self.documents_dir
        folder = self.folder(parent)
        if folder is None:
            raise KeyError(parent)
        return folder

    def _relocated(self, old: Path, new: Path) -> list[str]:
        """A folder moved: point what was inside at its new place."""
        old_s, new_s = str(old), str(Path(new).resolve())
        moved = []
        with self._lock:
            for table in (self._paths, self._folders):
                for key, value in table.items():
                    if value == old_s or value.startswith(old_s + os.sep):
                        table[key] = new_s + value[len(old_s):]
                        if table is self._paths:
                            moved.append(key)
            self._save_index()
        return moved

    # ── Adding documents ─────────────────────────────────────────────
    def _free_path(self, title: str, folder: Path,
                   suffix: str = EXTENSION) -> Path:
        base = _safe_name(title)
        path = folder / f"{base}{suffix}"
        n = 2
        while path.exists():
            path = folder / f"{base} {n}{suffix}"
            n += 1
        return path

    def create(self, title: str = "", kind: str = "doc",
               path: Path | None = None, parent: str | None = None) -> str:
        """A new, empty document file (in folder *parent*, else at the
        top); returns its id. A folder is made for kind "folder"."""
        if kind == FOLDER:
            return self.create_folder(title, parent)
        if kind not in KINDS:
            kind = "doc"
        default = UNTITLED[kind]
        base = self._container(parent)
        base.mkdir(parents=True, exist_ok=True)
        path = Path(path) if path else self._free_path(title or default, base)
        doc_id = str(uuid.uuid4())
        stamp = now_iso()
        DocFile(path).create({"id": doc_id, "title": title, "kind": kind,
                              "created_at": stamp, "updated_at": stamp})
        with self._lock:
            self._paths[doc_id] = str(path.resolve())
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
        """Still "Untitled document…" in the documents folder (or a folder
        in it): the name the app chose, which the title may replace."""
        file = self.get(doc_id)
        if file is None:
            return False
        path = file.path.resolve()
        root = self._root
        return ((path.parent == root or root in path.parents)
                and re.fullmatch(r"Untitled (document|spreadsheet|slides|note|chat|meeting)( \d+)?",
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


def _read_mark(folder: Path) -> dict | None:
    try:
        mark = json.loads((folder / FOLDER_MARK).read_text())
    except (OSError, ValueError):
        return None
    return mark if isinstance(mark, dict) else None
