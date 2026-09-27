"""SOV Meet: access tokens for the LiveKit video server.

A meeting's room is named after its document, so whoever can open the
document (a meeting, or a chat's call) can join the call, and nobody else.
"""

import time

from django.conf import settings

import jwt

TOKEN_LIFETIME = 6 * 3600


def is_enabled() -> bool:
    """Whether a video server is set up."""
    return bool(
        settings.LIVEKIT_URL and settings.LIVEKIT_API_KEY and settings.LIVEKIT_API_SECRET
    )


def room_token(room: str, identity: str, name: str) -> str:
    """A token letting *identity* (shown as *name*) join *room*: talk,
    show their camera and screen, and send messages."""
    now = int(time.time())
    claims = {
        "iss": settings.LIVEKIT_API_KEY,
        "sub": identity,
        "name": name,
        "nbf": now - 10,
        "exp": now + TOKEN_LIFETIME,
        "video": {
            "room": room,
            "roomJoin": True,
            "canPublish": True,
            "canSubscribe": True,
            "canPublishData": True,
        },
    }
    return jwt.encode(claims, settings.LIVEKIT_API_SECRET, algorithm="HS256")
