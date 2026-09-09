"""Tests for the /ws/migrations/{id} and /ws/groups/{chat_id}/sync endpoints.

Auth and snapshot behavior run against the fast sqlite fixture: `_authenticate()` in
app/api/v1/ws.py opens its own DB session via a module-level `SessionLocal` instead of
FastAPI's injected `get_db`, so it's monkeypatched directly here (same reasoning as the
worker tests — patch the name where it was imported, not where it's defined).

The live-relay test additionally needs a real Redis (see conftest's redis_conn) since that's
what actually carries a published event to the socket; it's skipped when Redis isn't reachable.
"""

import asyncio
import queue
import threading
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from starlette.testclient import TestClient, WebSocketDisconnect

import app.api.v1.ws as ws_module
import app.websocket.manager as manager_module
from app.core.config import get_settings
from app.core.security import create_access_token
from app.db.base import Base
from app.main import app as fastapi_app
from app.models import (
    ChatType,
    Migration,
    MigrationStatus,
    TelegramAccount,
    TelegramAccountStatus,
    TelegramChat,
    User,
    UserSession,
)
from tests.conftest import TEST_REDIS_URL

API = "/api/v1"


@pytest.fixture
async def ws_db(monkeypatch, tmp_path):
    """A file-backed sqlite schema, wired into app.api.v1.ws's SessionLocal, plus a separate
    session factory this test uses directly for seeding.

    File-backed, not `:memory:`, and via two independent engines: the websocket runs the ASGI
    app in TestClient's own portal thread/event loop, while seeding happens on this test's own
    loop. An in-memory sqlite db forces SQLAlchemy onto a single shared (StaticPool) connection,
    and even with a file, one shared engine's pool could still hand a connection opened on one
    loop to the other loop later — either way hits the same "asyncio object used on a different
    loop" failure mode as the Celery Redis bug this test suite exists to guard against. Separate
    engines against the same file avoid it: connections are never shared, only the data is.
    """
    db_path = tmp_path / "ws_test.sqlite3"
    db_url = f"sqlite+aiosqlite:///{db_path}"

    schema_engine = create_async_engine(db_url)
    async with schema_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await schema_engine.dispose()

    seed_engine = create_async_engine(db_url)
    ws_engine = create_async_engine(db_url)
    monkeypatch.setattr(ws_module, "SessionLocal", async_sessionmaker(ws_engine, expire_on_commit=False, class_=AsyncSession))

    yield async_sessionmaker(seed_engine, expire_on_commit=False, class_=AsyncSession)

    await seed_engine.dispose()
    await ws_engine.dispose()


async def _seed_user_and_session(Session):
    async with Session() as db:
        user = User(email=f"{uuid.uuid4()}@example.com", full_name="Test User", password_hash="x")
        db.add(user)
        await db.flush()
        session = UserSession(user_id=user.id, expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
        db.add(session)
        await db.commit()
        token = create_access_token(user.id, session.id)
        return user.id, token


async def _seed_migration(Session, user_id):
    async with Session() as db:
        account = TelegramAccount(user_id=user_id, telegram_user_id=1, status=TelegramAccountStatus.connected)
        db.add(account)
        await db.flush()
        source = TelegramChat(telegram_account_id=account.id, telegram_chat_id=-1, title="Source", chat_type=ChatType.supergroup)
        dest = TelegramChat(telegram_account_id=account.id, telegram_chat_id=-2, title="Dest", chat_type=ChatType.supergroup)
        db.add_all([source, dest])
        await db.flush()
        migration = Migration(
            user_id=user_id, telegram_account_id=account.id, source_chat_id=source.id, destination_chat_id=dest.id,
            name="Test", status=MigrationStatus.running, total_selected=10, processed=4, successful=3, already_member=1,
        )
        db.add(migration)
        await db.commit()
        return migration.id


async def _seed_chat(Session, user_id):
    async with Session() as db:
        account = TelegramAccount(user_id=user_id, telegram_user_id=1, status=TelegramAccountStatus.connected)
        db.add(account)
        await db.flush()
        chat = TelegramChat(telegram_account_id=account.id, telegram_chat_id=-1, title="Chat", chat_type=ChatType.supergroup)
        db.add(chat)
        await db.commit()
        return chat.id


async def test_missing_token_is_rejected(ws_db):
    with TestClient(fastapi_app) as client, pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(f"{API}/ws/migrations/{uuid.uuid4()}"):
            pass
    assert exc_info.value.code == 1008


async def test_migration_not_owned_is_rejected(ws_db):
    _user_id, token = await _seed_user_and_session(ws_db)
    other_user_id, _other_token = await _seed_user_and_session(ws_db)
    migration_id = await _seed_migration(ws_db, other_user_id)  # belongs to a different user

    with TestClient(fastapi_app, cookies={get_settings().cookie_name: token}) as client, pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(f"{API}/ws/migrations/{migration_id}"):
            pass
    assert exc_info.value.code == 1008


async def test_migration_snapshot_reflects_current_counters(ws_db):
    user_id, token = await _seed_user_and_session(ws_db)
    migration_id = await _seed_migration(ws_db, user_id)

    with TestClient(fastapi_app, cookies={get_settings().cookie_name: token}) as client:
        with client.websocket_connect(f"{API}/ws/migrations/{migration_id}") as ws:
            snapshot = ws.receive_json()

    assert snapshot["type"] == "snapshot"
    assert snapshot["status"] == "running"
    assert snapshot["counters"]["total_selected"] == 10
    assert snapshot["counters"]["processed"] == 4
    assert snapshot["counters"]["successful"] == 3
    assert snapshot["counters"]["already_member"] == 1


async def test_group_sync_relays_a_published_event(monkeypatch, ws_db, redis_conn):
    user_id, token = await _seed_user_and_session(ws_db)
    chat_id = await _seed_chat(ws_db, user_id)

    # The socket runs the ASGI app in a different thread/event loop (TestClient's portal), so
    # relay_channel must open its own Redis connection there rather than reuse `redis_conn`,
    # which belongs to this test's loop — an asyncio connection can't be shared across loops
    # (see the RESP2 fix in app/workers/migration_runner.py for the production-code version
    # of this exact mistake).
    monkeypatch.setattr(manager_module, "get_redis", lambda: aioredis.from_url(TEST_REDIS_URL, decode_responses=True, protocol=2))

    with TestClient(fastapi_app, cookies={get_settings().cookie_name: token}) as client:
        with client.websocket_connect(f"{API}/ws/groups/{chat_id}/sync") as ws:
            # Poll instead of a fixed sleep: publish only counts once the server-side
            # subscribe() has landed (Redis pub/sub has no queue for late subscribers), and a
            # fixed delay would either race or waste time depending on the machine.
            receivers = 0
            for _ in range(50):
                receivers = await redis_conn.publish(f"chat:{chat_id}:sync", '{"type":"progress","loaded":42}')
                if receivers:
                    break
                await asyncio.sleep(0.1)
            assert receivers == 1, "nothing was subscribed to the sync channel by the time we published"

            # A daemon thread rather than ThreadPoolExecutor: if receive_text() never returns
            # (a regression bringing back the hang this test caught once already), a pool's
            # __exit__ unconditionally joins its worker and hangs the whole suite regardless of
            # any .result(timeout=...) guard. A daemon thread can be abandoned — the queue.get
            # timeout below then fails just this test.
            result: queue.Queue[str] = queue.Queue()
            threading.Thread(target=lambda: result.put(ws.receive_text()), daemon=True).start()
            try:
                text = result.get(timeout=5)
            except queue.Empty:
                pytest.fail("the websocket never relayed the published event within 5s")

    assert text == '{"type":"progress","loaded":42}'
