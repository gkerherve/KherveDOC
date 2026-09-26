"""Where the standalone app keeps things, and its local server.

- The KherveDOC web app (a static build) ships inside the app: ``web/``
  next to the package when running from source, or in the PyInstaller
  bundle. ``KHERVEDOC_WEB_DIR`` overrides it.
- New documents go to ``~/Documents/KherveDOC``; the list of known
  documents lives in the app's data folder.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from PySide6.QtCore import QStandardPaths

from khervedoc_desktop.local.server import LocalServer
from khervedoc_desktop.local.store import EXTENSION, Library

_server: LocalServer | None = None
_library: Library | None = None


def web_dir() -> Path:
    if env := os.environ.get("KHERVEDOC_WEB_DIR"):
        return Path(env)
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent)) / "web"
    return Path(__file__).resolve().parent.parent / "web"


def pyodide_dir() -> Path | None:
    """The Pyodide files shipped with the app (spreadsheets offline)."""
    folder = web_dir().parent / "pyodide"
    return folder if (folder / "pyodide.js").is_file() else None


def web_version(folder: Path) -> str:
    """The web app's version, which the settings it is given must repeat
    (it reloads itself otherwise)."""
    try:
        return json.loads((folder / "kherve-web.json").read_text())["version"]
    except (OSError, ValueError, KeyError):
        return "0"


def documents_dir() -> Path:
    if env := os.environ.get("KHERVEDOC_DOCUMENTS_DIR"):
        return Path(env)
    docs = QStandardPaths.writableLocation(
        QStandardPaths.StandardLocation.DocumentsLocation)
    return Path(docs or Path.home()) / "KherveDOC"


def data_dir() -> Path:
    if env := os.environ.get("KHERVEDOC_DATA_DIR"):
        return Path(env)
    return Path(QStandardPaths.writableLocation(
        QStandardPaths.StandardLocation.AppDataLocation))


def available() -> bool:
    return (web_dir() / "index.html").is_file()


def start() -> LocalServer:
    global _server, _library
    if _server is None:
        folder = web_dir()
        _library = Library(data_dir(), documents_dir())
        _server = LocalServer(_library, folder, web_version(folder),
                              bundled_pyodide=pyodide_dir())
        _server.start()
    return _server


def server() -> LocalServer | None:
    return _server


def library() -> Library | None:
    return _library


def stop() -> None:
    if _server is not None:
        _server.stop()


def is_document_file(path: str) -> bool:
    return path.lower().endswith(EXTENSION)
