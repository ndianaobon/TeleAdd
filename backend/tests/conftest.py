import os

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-long-enough-for-hs256-0123456789")
os.environ.setdefault("SESSION_ENCRYPTION_KEY", "UjRSb2xkQ0tJU1dHaDJPUzBCeFBhQm5Dd2pkOWtvUGs=")

import pytest
import redis.asyncio as aioredis
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401  (register tables before creating schema)
from app.db.base import Base
from app.db.session import get_db
from app.main import app as fastapi_app


@pytest.fixture
async def db_engine():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest.fixture
async def client(db_engine):
    Session = async_sessionmaker(db_engine, expire_on_commit=False, class_=AsyncSession)

    async def override_db():
        async with Session() as session:
            yield session

    fastapi_app.dependency_overrides[get_db] = override_db
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url="http://test") as c:
        yield c
    fastapi_app.dependency_overrides.clear()


# ---- Real Postgres/Redis fixtures ----
#
# The Celery workers and the websocket layer's auth path each open their own connections
# directly from settings rather than through FastAPI's dependency-injected `get_db`/`get_redis`,
# so the sqlite-swap trick above doesn't reach them. These fixtures give tests that exercise
# those code paths a real (disposable) Postgres schema and Redis db, and skip cleanly when
# neither is configured/reachable — e.g. a contributor's machine without them running — while
# CI always provisions both as services so these tests are not skipped there.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://tmm:tmm@localhost:5432/tmm_test")
TEST_REDIS_URL = os.environ.get("TEST_REDIS_URL", "redis://localhost:6379/15")


@pytest.fixture
async def pg_session_factory():
    engine = create_async_engine(TEST_DATABASE_URL, pool_pre_ping=True)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as exc:  # noqa: BLE001 — any connection failure means "skip", not "fail"
        await engine.dispose()
        pytest.skip(f"Postgres not available at {TEST_DATABASE_URL} for integration tests: {exc}")
    try:
        yield async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    finally:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()


@pytest.fixture
async def redis_conn():
    # protocol=2: see app/core/redis.py — local dev's Windows Redis build predates RESP3.
    conn = aioredis.from_url(TEST_REDIS_URL, decode_responses=True, protocol=2)
    try:
        await conn.ping()
    except Exception as exc:  # noqa: BLE001
        await conn.aclose()
        pytest.skip(f"Redis not available at {TEST_REDIS_URL} for integration tests: {exc}")
    try:
        yield conn
    finally:
        await conn.flushdb()
        await conn.aclose()
