"""Shared pieces of the examples generator: writing document files."""

import json
import uuid
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "backend" / "core" / "examples"
STAMP = "2026-09-27T09:00:00Z"
#: As in the desktop app (sovoffice_desktop/local/store.py).
EXTENSIONS = {"doc": ".sdoc", "sheet": ".ssheet", "slide": ".sslides",
              "note": ".snote", "chat": ".schat", "meet": ".smeet"}


def write_kdoc(folder: str, filename: str, title: str, kind: str,
               content: bytes) -> Path:
    """One example file (the desktop app's format: meta + Yjs content)."""
    target = OUT / folder / f"{filename}{EXTENSIONS[kind]}"
    target.parent.mkdir(parents=True, exist_ok=True)
    meta = {"id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"kherve-example:{folder}/{filename}")),
            "title": title, "kind": kind,
            "created_at": STAMP, "updated_at": STAMP}
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("meta.json", json.dumps(meta, indent=1))
        z.writestr("content.bin", content)
    return target
