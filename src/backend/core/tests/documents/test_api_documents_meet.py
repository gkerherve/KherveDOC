"""SOV Chat and SOV Meet: chats and meetings are documents, and whoever can
open one gets a token for its video call."""

import jwt
import pytest
from rest_framework.test import APIClient

from core import factories

pytestmark = pytest.mark.django_db

LIVEKIT = {
    "LIVEKIT_URL": "ws://video.example",
    "LIVEKIT_API_KEY": "key",
    "LIVEKIT_API_SECRET": "secret",
}


@pytest.fixture(name="livekit")
def fixture_livekit(settings):
    for name, value in LIVEKIT.items():
        setattr(settings, name, value)


@pytest.mark.parametrize("kind", ["chat", "meet"])
def test_api_documents_create_chat_and_meet(kind):
    client = APIClient()
    client.force_login(factories.UserFactory())
    r = client.post("/api/v1.0/documents/", {"title": "Team", "kind": kind}, format="json")
    assert r.status_code == 201
    assert r.json()["kind"] == kind


def test_api_documents_meet_token(livekit):
    user = factories.UserFactory(full_name="Ada Lovelace")
    document = factories.DocumentFactory(kind="meet", users=[(user, "reader")])
    client = APIClient()
    client.force_login(user)

    r = client.post(f"/api/v1.0/documents/{document.id}/meet-token/")
    assert r.status_code == 200
    assert r.json()["url"] == "ws://video.example"
    claims = jwt.decode(r.json()["token"], "secret", algorithms=["HS256"])
    assert claims["iss"] == "key" and claims["sub"].startswith(f"{user.id}#")
    assert claims["name"] == "Ada Lovelace"
    assert claims["video"]["room"] == str(document.id)
    assert claims["video"]["roomJoin"] is True


def test_api_documents_meet_token_no_access(livekit):
    document = factories.DocumentFactory(kind="meet", link_reach="restricted")
    client = APIClient()
    client.force_login(factories.UserFactory())
    r = client.post(f"/api/v1.0/documents/{document.id}/meet-token/")
    assert r.status_code == 403


def test_api_documents_meet_token_public_guest(livekit):
    document = factories.DocumentFactory(kind="meet", link_reach="public")
    r = APIClient().post(
        f"/api/v1.0/documents/{document.id}/meet-token/", {"name": "Bob"}, format="json"
    )
    assert r.status_code == 200
    claims = jwt.decode(r.json()["token"], "secret", algorithms=["HS256"])
    assert claims["name"] == "Bob" and claims["sub"].startswith("guest-")


def test_api_documents_meet_token_not_set_up(settings):
    settings.LIVEKIT_URL = None
    user = factories.UserFactory()
    document = factories.DocumentFactory(kind="meet", users=[(user, "owner")])
    client = APIClient()
    client.force_login(user)
    r = client.post(f"/api/v1.0/documents/{document.id}/meet-token/")
    assert r.status_code == 503
    assert client.get("/api/v1.0/config/").json()["MEET_ENABLED"] is False
