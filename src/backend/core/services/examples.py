"""The examples folder: documents, spreadsheets and slides to learn from.

The examples are ``.kdoc`` files (the desktop app's format: a ZIP holding
``meta.json`` and the Yjs ``content.bin``) in ``core/examples/<folder>/``,
made by ``bin/make-examples.py``. Each user can add their own copy: an
"Examples" folder with one sub-folder per kind.
"""

import base64
import json
import zipfile
from pathlib import Path

from django.db import transaction

from core import models

EXAMPLES_DIR = Path(__file__).resolve().parent.parent / "examples"

#: Sub-folders in the order they are shown.
FOLDERS = ("Documents", "Spreadsheets", "Slides")


def example_files():
    """(folder name, [.kdoc paths]) for each examples sub-folder."""
    found = []
    for name in FOLDERS:
        folder = EXAMPLES_DIR / name
        if folder.is_dir():
            found.append((name, sorted(folder.glob("*.kdoc"))))
    return found


def read_kdoc(path):
    """(meta, content as base64) of a .kdoc file."""
    with zipfile.ZipFile(path) as archive:
        meta = json.loads(archive.read("meta.json"))
        try:
            content = archive.read("content.bin")
        except KeyError:
            content = b""
    return meta, base64.b64encode(content).decode()


@transaction.atomic
def create_examples(user):
    """Give *user* their own "Examples" folder; returns it."""
    root = models.Document.add_root(
        title="Examples", kind=models.DocumentKind.FOLDER, creator=user
    )
    models.DocumentAccess.objects.create(
        document=root, user=user, role=models.RoleChoices.OWNER
    )
    for name, paths in example_files():
        folder = root.add_child(
            title=name, kind=models.DocumentKind.FOLDER, creator=user
        )
        for path in paths:
            meta, content = read_kdoc(path)
            kind = meta.get("kind") or models.DocumentKind.DOCUMENT
            if kind not in models.DocumentKind.values:
                kind = models.DocumentKind.DOCUMENT
            child = folder.add_child(
                title=meta.get("title") or path.stem, kind=kind, creator=user
            )
            if content:
                child.content = content
                child.save()
    return root
