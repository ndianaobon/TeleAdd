import asyncio
import time

from fastapi import APIRouter
from sqlalchemy import text

from app.core.redis import get_redis
from app.db.session import engine

router = APIRouter(tags=["health"])


async def _check(coro) -> dict:
    start = time.perf_counter()
    try:
        await asyncio.wait_for(coro, timeout=3)
        return {"status": "healthy", "latency_ms": round((time.perf_counter() - start) * 1000, 1)}
    except Exception as exc:  # noqa: BLE001
        return {"status": "unhealthy", "error": type(exc).__name__}


async def _db_ping():
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))


async def _worker_ping() -> None:
    from app.workers.celery_app import celery_app

    replies = await asyncio.to_thread(lambda: celery_app.control.ping(timeout=1.5))
    if not replies:
        raise RuntimeError("no workers responded")


async def full_health() -> dict:
    db, redis, worker = await asyncio.gather(_check(_db_ping()), _check(get_redis().ping()), _check(_worker_ping()))
    overall = "healthy" if all(c["status"] == "healthy" for c in (db, redis)) else "degraded"
    return {"status": overall, "api": {"status": "healthy"}, "database": db, "redis": redis, "worker": worker}


@router.get("/health")
async def health():
    return await full_health()


@router.get("/health/live")
async def live():
    return {"status": "ok"}
