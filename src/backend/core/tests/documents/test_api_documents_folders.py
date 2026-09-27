"""
Folders are documents of kind "folder": they hold other documents (their
children), nest inside each other as deep as wanted, and documents move in
and out of them.
"""

import pytest
from rest_framework.test import APIClient

from core import factories
from core.models import Document, DocumentKind

pytestmark = pytest.mark.django_db


def logged_in_client():
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)
    return user, client


def test_api_documents_folders_nest_and_hold_documents():
    _, client = logged_in_client()
    response = client.post("/api/v1.0/documents/",
                           {"title": "Projects", "kind": "folder"},
                           format="json")
    assert response.status_code == 201
    folder = response.json()
    assert folder["kind"] == "folder"

    # A folder inside the folder, and a document and a spreadsheet in it.
    inner = client.post(f"/api/v1.0/documents/{folder['id']}/children/",
                        {"title": "2027", "kind": "folder"}, format="json")
    assert inner.status_code == 201
    inner = inner.json()
    for title, kind in (("Plan", "doc"), ("Budget", "sheet")):
        r = client.post(f"/api/v1.0/documents/{inner['id']}/children/",
                        {"title": title, "kind": kind}, format="json")
        assert r.status_code == 201 and r.json()["kind"] == kind

    # The home list shows the folder, not what it holds.
    listed = client.get("/api/v1.0/documents/").json()["results"]
    assert [(d["title"], d["kind"]) for d in listed] == [("Projects", "folder")]
    children = client.get(
        f"/api/v1.0/documents/{inner['id']}/children/").json()["results"]
    assert sorted(d["title"] for d in children) == ["Budget", "Plan"]
    assert Document.objects.get(title="Plan").get_parent().kind == \
        DocumentKind.FOLDER


def test_api_documents_move_into_and_out_of_a_folder():
    user, client = logged_in_client()
    folder = factories.DocumentFactory(users=[(user, "owner")],
                                       kind=DocumentKind.FOLDER,
                                       title="Archive")
    doc = factories.DocumentFactory(users=[(user, "owner")], title="Old")

    r = client.post(f"/api/v1.0/documents/{doc.id}/move/",
                    {"target_document_id": str(folder.id),
                     "position": "last-child"}, format="json")
    assert r.status_code == 200
    doc.refresh_from_db()
    assert doc.get_parent() == folder

    # Back to the top level: beside the folder.
    r = client.post(f"/api/v1.0/documents/{doc.id}/move/",
                    {"target_document_id": str(folder.id),
                     "position": "right"}, format="json")
    assert r.status_code == 200
    doc.refresh_from_db()
    assert doc.is_root()
    # Still the user's document after moving back.
    assert doc.get_role(user) == "owner"


def test_api_documents_list_filter_folders():
    """?kind=folder: the folders at the top level only."""
    user, client = logged_in_client()
    top = factories.DocumentFactory(users=[(user, "owner")],
                                    kind=DocumentKind.FOLDER, title="Top")
    factories.DocumentFactory(parent=top, kind=DocumentKind.FOLDER,
                              title="Inner")
    factories.DocumentFactory(users=[(user, "owner")], title="Loose")

    listed = client.get("/api/v1.0/documents/?kind=folder").json()["results"]
    assert [d["title"] for d in listed] == ["Top"]
