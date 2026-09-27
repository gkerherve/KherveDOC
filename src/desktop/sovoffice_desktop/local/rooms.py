"""Live documents of the standalone app: the Hocuspocus side.

Each open document is a *room*: a pycrdt Doc loaded from its document file
file, the editor windows connected to it (each a WebSocket speaking the
Hocuspocus protocol, like Sovereign Office's collaboration server), and a save
shortly after every change. Two windows on one document stay in step,
cursors included.

Everything here runs on the local server's asyncio loop.
"""

from __future__ import annotations

import asyncio
import logging
import zipfile
from typing import Callable

from pycrdt import (
    Doc,
    YSyncMessageType,
    create_sync_message,
    create_update_message,
    handle_sync_message,
)

from . import hocuspocus as hp
from .store import DocFile, is_conflict_copy, move_to_trash

log = logging.getLogger(__name__)

SAVE_DELAY_S = 1.0


def _auth_ok(document: str, scope: str = "read-write") -> bytes:
    return hp.frame(document, hp.write_var_uint(hp.AUTH)
                    + hp.write_var_uint(hp.AUTH_OK)
                    + hp.write_var_string(scope))


def _sync_status(document: str, saved: bool = True) -> bytes:
    return hp.frame(document, hp.write_var_uint(hp.SYNC_STATUS)
                    + hp.write_var_uint(1 if saved else 0))


class Client:
    """One editor connection (a WebSocket)."""

    def __init__(self, send: Callable[[bytes], "asyncio.Future"]):
        self.send = send
        self.authenticated = False
        #: The last awareness message (cursor, name) this client sent.
        self.awareness: bytes | None = None


class Room:
    def __init__(self, doc_id: str, file: DocFile):
        self.doc_id = doc_id
        self.file = file
        self.ydoc = Doc()
        #: The file as last read or written here: when it differs, another
        #: computer's changes came in (a shared kDrive / Dropbox folder).
        self._signature = file.signature()
        content = file.content()
        if content:
            self.ydoc.apply_update(content)
        self.clients: set[Client] = set()
        self._sender: Client | None = None
        self._save_handle: asyncio.TimerHandle | None = None
        self._subscription = self.ydoc.observe(self._on_update)

    # ── State ────────────────────────────────────────────────────────
    def state(self) -> bytes:
        return self.ydoc.get_update()

    def apply(self, update: bytes) -> None:
        """Merge a full or partial Yjs update (e.g. the editor's save)."""
        self.ydoc.apply_update(update)

    def _on_update(self, event) -> None:
        message = create_update_message(event.update)
        for client in list(self.clients):
            if client is not self._sender and client.authenticated:
                asyncio.ensure_future(self._send(client, message))
        self._schedule_save()

    def _schedule_save(self) -> None:
        loop = asyncio.get_event_loop()
        if self._save_handle is not None:
            self._save_handle.cancel()
        self._save_handle = loop.call_later(SAVE_DELAY_S, self.save)

    def save(self) -> None:
        self._save_handle = None
        try:
            # Changes synced in since the last look are merged, not lost.
            self.check_file()
            self.file.write_content(self.state())
            self._signature = self.file.signature()
        except OSError:
            log.exception("Could not save %s", self.file.path)

    # ── The file changed on disk (shared folder) ─────────────────────
    def check_file(self) -> None:
        """Merge the file's changes if another computer's arrived (the
        editors see them at once), and take in conflict copies."""
        signature = self.file.signature()
        if signature is not None and signature != self._signature:
            try:
                content = self.file.content()
            except (OSError, KeyError, zipfile.BadZipFile):
                return  # still being synced: next time
            self._signature = signature
            self._take_in(content)
        folder = self.file.path.parent
        try:
            candidates = [p for p in folder.iterdir()
                          if is_conflict_copy(p, self.file.path)]
        except OSError:
            return
        for path in candidates:
            copy = DocFile(path)
            try:
                if copy.meta().get("id") != self.doc_id:
                    continue
                self.take_in_copy(copy)
            except (OSError, KeyError, ValueError, zipfile.BadZipFile):
                continue
            move_to_trash(path)

    def take_in_copy(self, copy: DocFile) -> None:
        """Another version of this document: merge its text now, and keep
        its pictures in this document's file."""
        self._take_in(copy.content())
        missing = copy.media_keys() - self.file.media_keys()
        for key in missing:
            data = copy.media(key)
            if data is not None:
                self.file.put_media(key, data)
        self._signature = self.file.signature()

    def _take_in(self, content: bytes) -> None:
        """Merge another version's changes: the editors get them (see
        _on_update), and the merged document is saved."""
        if content:
            self.ydoc.apply_update(content)

    def flush(self) -> None:
        """Save now if a save is pending."""
        if self._save_handle is not None:
            self._save_handle.cancel()
            self.save()

    # ── Connections ──────────────────────────────────────────────────
    async def _send(self, client: Client, message: bytes) -> None:
        try:
            await client.send(hp.frame(self.doc_id, message))
        except Exception:  # the socket closed meanwhile
            self.clients.discard(client)

    async def _send_raw(self, client: Client, data: bytes) -> None:
        try:
            await client.send(data)
        except Exception:
            self.clients.discard(client)

    def join(self, client: Client) -> None:
        self.clients.add(client)

    def leave(self, client: Client) -> None:
        self.clients.discard(client)

    async def receive(self, client: Client, data: bytes) -> None:
        """Handle one Hocuspocus message from *client*."""
        try:
            document, kind, rest = hp.parse(data)
        except (IndexError, UnicodeDecodeError):
            return
        if document != self.doc_id:
            return
        if kind == hp.AUTH:
            client.authenticated = True
            await self._send_raw(client, _auth_ok(self.doc_id))
            # The others' cursors, straight away.
            for other in list(self.clients):
                if other is not client and other.awareness:
                    await self._send_raw(client, other.awareness)
            return
        if not client.authenticated:
            return
        if kind in (hp.SYNC, hp.SYNC_REPLY):
            sync_type = rest[0] if rest else None
            self._sender = client
            try:
                reply = handle_sync_message(rest, self.ydoc)
            finally:
                self._sender = None
            if reply is not None:
                await self._send(client, reply)
            if sync_type == YSyncMessageType.SYNC_STEP1:
                # Ask the editor for what it has and we do not.
                await self._send(client, create_sync_message(self.ydoc))
            elif sync_type in (YSyncMessageType.SYNC_STEP2,
                               YSyncMessageType.SYNC_UPDATE):
                await self._send_raw(client, _sync_status(self.doc_id))
        elif kind == hp.AWARENESS:
            client.awareness = data
            for other in list(self.clients):
                if other is not client and other.authenticated:
                    await self._send_raw(other, data)
        elif kind == hp.QUERY_AWARENESS:
            for other in list(self.clients):
                if other is not client and other.awareness:
                    await self._send_raw(client, other.awareness)


class Rooms:
    """The rooms of the documents currently open."""

    def __init__(self, library):
        self.library = library
        self._rooms: dict[str, Room] = {}
        library.on_conflict = self.take_in_conflict

    def get(self, doc_id: str) -> Room | None:
        room = self._rooms.get(doc_id)
        if room is None:
            file = self.library.get(doc_id)
            if file is None:
                return None
            room = self._rooms[doc_id] = Room(doc_id, file)
        return room

    def relocate(self, doc_id: str) -> None:
        """The document's file moved (Save As): save there from now on."""
        room = self._rooms.get(doc_id)
        file = self.library.get(doc_id)
        if room is not None and file is not None:
            room.flush()
            room.file = file

    def check_files(self) -> None:
        """Look at the open documents' files (see Room.check_file)."""
        for room in list(self._rooms.values()):
            try:
                room.check_file()
            except Exception:  # one bad file must not stop the others
                log.exception("Checking %s", room.file.path)

    def take_in_conflict(self, doc_id: str, copy: DocFile) -> bool:
        """Library.on_conflict: an open document merges the copy itself."""
        room = self._rooms.get(doc_id)
        if room is None:
            return False
        room.take_in_copy(copy)
        return True

    def forget(self, doc_id: str) -> None:
        room = self._rooms.pop(doc_id, None)
        if room is not None:
            room.flush()

    def flush_doc(self, doc_id: str) -> None:
        room = self._rooms.get(doc_id)
        if room is not None:
            room.flush()

    def flush_all(self) -> None:
        for room in self._rooms.values():
            room.flush()
