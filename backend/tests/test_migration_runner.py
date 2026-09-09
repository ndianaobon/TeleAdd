"""Integration tests for MigrationRunner against real Postgres + Redis (see conftest's
pg_session_factory / redis_conn), with only the Telegram client faked. This is the code path
that a Celery worker actually executes for `migration.run` — it opens its own DB engine and
Redis connection per task instead of going through FastAPI's dependency injection, so the
sqlite-swap used for HTTP-endpoint tests doesn't reach it.
"""

import contextlib
import json
import uuid
from types import SimpleNamespace

import pytest
from telethon import errors

import app.workers.migration_runner as migration_runner_module
from app.core.redis import migration_control_key, migration_events_channel
from app.models import (
    ChatType,
    Migration,
    MigrationMember,
    MigrationMemberResult,
    MigrationStatus,
    TelegramAccount,
    TelegramAccountStatus,
    TelegramChat,
    TelegramMember,
    User,
)
from app.services.telegram.client_manager import client_manager
from app.workers.migration_runner import MigrationRunner
from tests.conftest import TEST_DATABASE_URL, TEST_REDIS_URL


class FakeInviteClient:
    """Stands in for a connected Telethon client during a migration run."""

    def __init__(self, raises: Exception | None = None):
        self.raises = raises
        self.calls = 0

    async def __call__(self, request):
        self.calls += 1
        if self.raises:
            raise self.raises
        return SimpleNamespace(missing_invitees=[])


def _fake_for_account(client):
    @contextlib.asynccontextmanager
    async def _ctx(_account):
        yield client

    return _ctx


async def _seed_migration(Session, *, member_count: int, cooldown_seconds: int = 0):
    async with Session() as db:
        user = User(email=f"{uuid.uuid4()}@example.com", full_name="Test User", password_hash="x")
        db.add(user)
        await db.flush()

        account = TelegramAccount(user_id=user.id, telegram_user_id=1, session_encrypted=b"placeholder", status=TelegramAccountStatus.connected)
        db.add(account)
        await db.flush()

        source = TelegramChat(telegram_account_id=account.id, telegram_chat_id=-100111, title="Source", chat_type=ChatType.supergroup, can_invite_users=True)
        dest = TelegramChat(telegram_account_id=account.id, telegram_chat_id=-100222, title="Dest", chat_type=ChatType.supergroup, can_invite_users=True)
        db.add_all([source, dest])
        await db.flush()

        members = [TelegramMember(telegram_chat_id=source.id, telegram_user_id=1000 + i, access_hash=1, first_name=f"Member{i}") for i in range(member_count)]
        db.add_all(members)
        await db.flush()

        migration = Migration(
            user_id=user.id,
            telegram_account_id=account.id,
            source_chat_id=source.id,
            destination_chat_id=dest.id,
            name="Test migration",
            status=MigrationStatus.queued,
            config={"cooldown_seconds": cooldown_seconds},
            total_selected=member_count,
        )
        db.add(migration)
        await db.flush()
        db.add_all(MigrationMember(migration_id=migration.id, telegram_member_id=m.id, telegram_user_id=m.telegram_user_id, username=m.username) for m in members)
        await db.commit()
        return migration.id, account.id


def _patch_settings(monkeypatch, **overrides):
    real_settings = migration_runner_module.get_settings()
    fake_settings = real_settings.model_copy(update=overrides)
    monkeypatch.setattr(migration_runner_module, "get_settings", lambda: fake_settings)


async def test_migration_completes_when_every_invite_succeeds(monkeypatch, pg_session_factory, redis_conn):
    migration_id, _account_id = await _seed_migration(pg_session_factory, member_count=3)
    _patch_settings(monkeypatch, database_url=TEST_DATABASE_URL, redis_url=TEST_REDIS_URL, max_flood_wait_seconds=3600)
    fake_client = FakeInviteClient()
    monkeypatch.setattr(client_manager, "for_account", _fake_for_account(fake_client))

    result = await MigrationRunner(str(migration_id)).run()

    assert result["status"] == "completed"
    assert fake_client.calls == 3
    async with pg_session_factory() as db:
        migration = await db.get(Migration, migration_id)
        assert migration.status == MigrationStatus.completed
        assert migration.processed == 3
        assert migration.successful == 3
        assert migration.finished_at is not None
        rows = (await db.execute(MigrationMember.__table__.select().where(MigrationMember.migration_id == migration_id))).all()
        assert all(r.result == MigrationMemberResult.success for r in rows)


async def test_large_flood_wait_pauses_and_restricts_account(monkeypatch, pg_session_factory, redis_conn):
    migration_id, account_id = await _seed_migration(pg_session_factory, member_count=2)
    _patch_settings(monkeypatch, database_url=TEST_DATABASE_URL, redis_url=TEST_REDIS_URL, max_flood_wait_seconds=5)
    fake_client = FakeInviteClient(raises=errors.FloodWaitError(request=None, capture=999))
    monkeypatch.setattr(client_manager, "for_account", _fake_for_account(fake_client))

    result = await MigrationRunner(str(migration_id)).run()

    assert result["status"] == "paused"
    assert fake_client.calls == 1  # stops at the first member instead of burning through the rest
    async with pg_session_factory() as db:
        migration = await db.get(Migration, migration_id)
        assert migration.status == MigrationStatus.paused
        assert migration.processed == 0
        account = await db.get(TelegramAccount, account_id)
        assert account.status == TelegramAccountStatus.restricted


async def test_cancel_control_key_stops_before_any_invite(monkeypatch, pg_session_factory, redis_conn):
    migration_id, _account_id = await _seed_migration(pg_session_factory, member_count=5)
    _patch_settings(monkeypatch, database_url=TEST_DATABASE_URL, redis_url=TEST_REDIS_URL, max_flood_wait_seconds=3600)
    fake_client = FakeInviteClient()
    monkeypatch.setattr(client_manager, "for_account", _fake_for_account(fake_client))
    await redis_conn.set(migration_control_key(str(migration_id)), "cancel")

    result = await MigrationRunner(str(migration_id)).run()

    assert result["status"] == "cancelled"
    assert fake_client.calls == 0
    async with pg_session_factory() as db:
        migration = await db.get(Migration, migration_id)
        assert migration.status == MigrationStatus.cancelled
        assert migration.processed == 0


async def test_status_changes_are_published_for_live_progress(monkeypatch, pg_session_factory, redis_conn):
    migration_id, _account_id = await _seed_migration(pg_session_factory, member_count=1)
    _patch_settings(monkeypatch, database_url=TEST_DATABASE_URL, redis_url=TEST_REDIS_URL, max_flood_wait_seconds=3600)
    fake_client = FakeInviteClient()
    monkeypatch.setattr(client_manager, "for_account", _fake_for_account(fake_client))

    pubsub = redis_conn.pubsub()
    await pubsub.subscribe(migration_events_channel(str(migration_id)))
    await pubsub.get_message(timeout=1)  # the subscribe confirmation

    await MigrationRunner(str(migration_id)).run()

    seen_types = []
    for _ in range(10):
        msg = await pubsub.get_message(timeout=1)
        if msg is None:
            break
        if msg.get("type") == "message":
            seen_types.append(json.loads(msg["data"])["type"])
    await pubsub.aclose()

    assert "status_change" in seen_types  # running -> ...
    assert "member_result" in seen_types
