import json
import uuid

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.redis import get_redis
from app.models import TelegramAccount, TelegramChat
from app.services.telegram.member_service import telegram_member_service

log = get_logger(__name__)


def chat_sync_channel(chat_id: str) -> str:
    return f"chat:{chat_id}:sync"


async def sync_chat_members(account_id: str, chat_id: str) -> dict:
    engine = create_async_engine(get_settings().database_url, pool_pre_ping=True)
    Session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    redis = get_redis()
    channel = chat_sync_channel(chat_id)
    try:
        async with Session() as db:
            account = await db.get(TelegramAccount, uuid.UUID(account_id))
            chat = await db.get(TelegramChat, uuid.UUID(chat_id))
            if not account or not chat:
                return {"status": "not_found"}

            async def progress(n: int) -> None:
                await redis.publish(channel, json.dumps({"type": "progress", "loaded": n}))

            await redis.publish(channel, json.dumps({"type": "started"}))
            total = await telegram_member_service.sync_members(db, account, chat, progress_cb=progress)
            await redis.publish(channel, json.dumps({"type": "completed", "total": total}))
            log.info("members_synced", chat_id=chat_id, total=total)
            return {"status": "completed", "total": total}
    except Exception as exc:  # noqa: BLE001
        log.exception("member_sync_failed", chat_id=chat_id, error=type(exc).__name__)
        await redis.publish(channel, json.dumps({"type": "failed", "error": type(exc).__name__}))
        raise
    finally:
        await engine.dispose()
