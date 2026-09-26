"""
Documents are text (BlockNote) or spreadsheets (KherveCELL): the kind is
chosen at creation and kept for the document's life.
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


def test_api_documents_kind_defaults_to_text_documents():
    _, client = logged_in_client()
    response = client.post("/api/v1.0/documents/", {"title": "Notes"},
                           format="json")
    assert response.status_code == 201
    assert response.json()["kind"] == "doc"
    assert Document.objects.get().kind == DocumentKind.DOCUMENT


def test_api_documents_create_a_spreadsheet():
    _, client = logged_in_client()
    response = client.post(
        "/api/v1.0/documents/", {"title": "Budget", "kind": "sheet"},
        format="json")
    assert response.status_code == 201
    document = Document.objects.get()
    assert document.kind == DocumentKind.SPREADSHEET
    listed = client.get("/api/v1.0/documents/").json()["results"]
    assert [d["kind"] for d in listed] == ["sheet"]


def test_api_documents_kind_must_be_known():
    _, client = logged_in_client()
    response = client.post(
        "/api/v1.0/documents/", {"title": "x", "kind": "slides"}, format="json")
    assert response.status_code == 400
    assert "kind" in response.json()


def test_api_documents_kind_cannot_change_after_creation():
    user, client = logged_in_client()
    document = factories.DocumentFactory(users=[(user, "owner")],
                                         kind=DocumentKind.SPREADSHEET)
    response = client.patch(f"/api/v1.0/documents/{document.id}/",
                            {"kind": "doc"}, format="json")
    assert response.status_code == 200
    document.refresh_from_db()
    assert document.kind == DocumentKind.SPREADSHEET


def test_api_documents_duplicate_keeps_the_kind():
    user, client = logged_in_client()
    document = factories.DocumentFactory(users=[(user, "owner")],
                                         kind=DocumentKind.SPREADSHEET)
    response = client.post(f"/api/v1.0/documents/{document.id}/duplicate/")
    assert response.status_code == 201
    copy = Document.objects.get(id=response.json()["id"])
    assert copy.kind == DocumentKind.SPREADSHEET


def test_api_documents_spreadsheets_have_no_ai_abilities(settings):
    settings.AI_ALLOW_REACH_FROM = "restricted"
    user, client = logged_in_client()
    text = factories.DocumentFactory(users=[(user, "owner")])
    sheet = factories.DocumentFactory(users=[(user, "owner")],
                                      kind=DocumentKind.SPREADSHEET)
    text_abilities = client.get(f"/api/v1.0/documents/{text.id}/").json()[
        "abilities"]
    sheet_abilities = client.get(f"/api/v1.0/documents/{sheet.id}/").json()[
        "abilities"]
    assert text_abilities["ai_transform"] is True
    assert sheet_abilities["ai_transform"] is False
    assert sheet_abilities["ai_proxy"] is False
