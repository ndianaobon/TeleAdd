"""Integration test for the member-sync worker task against real Postgres + Redis, with only
the Telegram client faked. Exercises the exact pipeline the '/ws/groups/{chat_id}/sync' socket
reports progress from: `sync_chat_members` publishing started/completed onto the same Redis
channel the websocket relays.
"""

import contextlib
import json
import uuid

import pytest
from sqlalchemy import select
from telethon.tl.types import User as TLUser

import app.workers.member_sync as member_sync_module
from app.models import ChatType, TelegramAccount, TelegramAccountStatus, TelegramChat, TelegramMember, User
from app.services.telegram.client_manager import client_manager
from app.workers.member_sync import chat_sync_channel, sync_chat_members
from tests.conftest import TEST_DATABASE_URL, TEST_REDIS_URL


class FakeParticipantsClient:
    def __init__(self, users: list[TLUser]):
        self._users = users

    async def iter_participants(self, _peer):
        for user in self._users:
            yield user


def _fake_for_account(client):
    @contextlib.asynccontextmanager
    async def _ctx(_account):
        yield client

    return _ctx


def _patch_settings(monkeypatch):
    real_settings = member_sync_module.get_settings()  # captured before patching — see note below
    fake_settings = real_settings.model_copy(update={"database_url": TEST_DATABASE_URL, "redis_url": TEST_REDIS_URL})
    # The lambda must close over `fake_settings`, not call member_sync_module.get_settings()
    # again — by the time it runs, that name already points at this very lambda, so
    # referencing it there recurses infinitely (and RecursionError subclasses RuntimeError,
    # so it can silently slip through an unrelated `pytest.raises(RuntimeError)` elsewhere).
    monkeypatch.setattr(member_sync_module, "get_settings", lambda: fake_settings)


async def _seed_chat(Session):
    async with Session() as db:
        user = User(email=f"{uuid.uuid4()}@example.com", full_name="Test User", password_hash="x")
        db.add(user)
        await db.flush()
        account = TelegramAccount(user_id=user.id, telegram_user_id=1, session_encrypted=b"placeholder", status=TelegramAccountStatus.connected)
        db.add(account)
        await db.flush()
        chat = TelegramChat(telegram_account_id=account.id, telegram_chat_id=-100333, access_hash=42, title="Source", chat_type=ChatType.supergroup, can_invite_users=True)
        db.add(chat)
        await db.commit()
        return account.id, chat.id


async def test_sync_writes_members_and_publishes_progress(monkeypatch, pg_session_factory, redis_conn):
    account_id, chat_id = await _seed_chat(pg_session_factory)
    _patch_settings(monkeypatch)

    users = [
        TLUser(id=111, access_hash=1, first_name="Alice", username="alice", bot=False, deleted=False),
        TLUser(id=222, access_hash=2, first_name="Botty", bot=True, deleted=False),
        TLUser(id=333, access_hash=3, first_name="Deleted", bot=False, deleted=True),
    ]
    monkeypatch.setattr(client_manager, "for_account", _fake_for_account(FakeParticipantsClient(users)))

    pubsub = redis_conn.pubsub()
    await pubsub.subscribe(chat_sync_channel(str(chat_id)))
    await pubsub.get_message(timeout=1)  # the subscribe confirmation

    result = await sync_chat_members(str(account_id), str(chat_id))

    assert result == {"status": "completed", "total": 3}

    events = []
    for _ in range(5):
        msg = await pubsub.get_message(timeout=1)
        if msg is None:
            break
        if msg.get("type") == "message":
            events.append(json.loads(msg["data"]))
    await pubsub.aclose()
    assert events[0] == {"type": "started"}
    assert {"type": "completed", "total": 3} in events

    async with pg_session_factory() as db:
        chat = await db.get(TelegramChat, chat_id)
        assert chat.members_synced_at is not None
        assert chat.member_count == 3
        rows = (await db.scalars(select(TelegramMember).where(TelegramMember.telegram_chat_id == chat_id))).all()
        by_id = {r.telegram_user_id: r for r in rows}
        assert len(rows) == 3
        assert by_id[111].is_bot is False and by_id[111].is_deleted is False and by_id[111].username == "alice"
        assert by_id[222].is_bot is True
        assert by_id[333].is_deleted is True


async def test_sync_failure_publishes_failed_event(monkeypatch, pg_session_factory, redis_conn):
    account_id, chat_id = await _seed_chat(pg_session_factory)
    _patch_settings(monkeypatch)

    class BrokenClient:
        async def iter_participants(self, _peer):
            raise RuntimeError("simulated Telegram failure")
            yield  # pragma: no cover — makes this an async generator

    monkeypatch.setattr(client_manager, "for_account", _fake_for_account(BrokenClient()))

    pubsub = redis_conn.pubsub()
    await pubsub.subscribe(chat_sync_channel(str(chat_id)))
    await pubsub.get_message(timeout=1)

    with pytest.raises(RuntimeError):
        await sync_chat_members(str(account_id), str(chat_id))

    events = []
    for _ in range(5):
        msg = await pubsub.get_message(timeout=1)
        if msg is None:
            break
        if msg.get("type") == "message":
            events.append(json.loads(msg["data"]))
    await pubsub.aclose()
    assert {"type": "failed", "error": "RuntimeError"} in events
