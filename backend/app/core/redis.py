from functools import lru_cache

import redis.asyncio as aioredis

from app.core.config import get_settings


@lru_cache
def get_redis() -> aioredis.Redis:
    # protocol=2: the Windows Redis 5.0 build in local dev predates RESP3/HELLO (Redis 6.0+),
    # so the client must stay on RESP2 instead of trying to negotiate up.
    return aioredis.from_url(get_settings().redis_url, decode_responses=True, protocol=2)


def migration_control_key(migration_id: str) -> str:
    return f"migration:{migration_id}:control"


def migration_events_channel(migration_id: str) -> str:
    return f"migration:{migration_id}:events"


def pending_auth_key(auth_id: str) -> str:
    return f"tg_auth:{auth_id}"
