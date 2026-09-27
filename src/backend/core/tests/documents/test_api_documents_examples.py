"""The Examples folder: documents, spreadsheets and slides to learn from."""

import pytest
from rest_framework.test import APIClient

from core import factories
from core.models import Document, DocumentKind
from core.services.examples import example_files

pytestmark = pytest.mark.django_db


def test_api_documents_examples_anonymous():
    assert APIClient().post("/api/v1.0/documents/examples/").status_code == 401


def test_api_documents_examples_folder():
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    r = client.post("/api/v1.0/documents/examples/")
    assert r.status_code == 201
    root = Document.objects.get(pk=r.json()["id"])
    assert root.title == "Examples" and root.kind == DocumentKind.FOLDER
    assert root.get_role(user) == "owner"

    folders = {f.title: f for f in root.get_children()}
    assert set(folders) == {"Documents", "Spreadsheets", "Slides"}
    kinds = {name: {d.kind for d in f.get_children()} for name, f in folders.items()}
    assert kinds == {"Documents": {"doc"}, "Spreadsheets": {"sheet"}, "Slides": {"slide"}}
    expected = sum(len(paths) for _, paths in example_files())
    assert sum(f.get_children_count() for f in folders.values()) == expected >= 30

    # The examples have content, and the user sees the folder at the top.
    deck = folders["Slides"].get_children().first()
    assert deck.content
    listed = client.get("/api/v1.0/documents/?kind=folder").json()["results"]
    assert [d["title"] for d in listed] == ["Examples"]


def test_api_documents_create_slides():
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)
    r = client.post("/api/v1.0/documents/", {"title": "Pitch", "kind": "slide"}, format="json")
    assert r.status_code == 201
    assert r.json()["kind"] == "slide"
