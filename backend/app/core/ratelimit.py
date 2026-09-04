from fastapi import HTTPException, Request, status

from app.core.config import get_settings
from app.core.redis import get_redis


def rate_limit(scope: str, limit: int, window_seconds: int):
    async def dependency(request: Request) -> None:
        if get_settings().app_env == "test":
            return
        ip = request.client.host if request.client else "unknown"
        key = f"ratelimit:{scope}:{ip}"
        try:
            redis = get_redis()
            count = await redis.incr(key)
            if count == 1:
                await redis.expire(key, window_seconds)
        except Exception:  # noqa: BLE001 — never lock users out because Redis blinked
            return
        if count > limit:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Please try again later.")

    return dependency
