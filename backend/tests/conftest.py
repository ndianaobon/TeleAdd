import os

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-long-enough-for-hs256-0123456789")
os.environ.setdefault("SESSION_ENCRYPTION_KEY", "UjRSb2xkQ0tJU1dHaDJPUzBCeFBhQm5Dd2pkOWtvUGs=")

import pytest
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
