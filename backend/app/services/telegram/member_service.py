from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from telethon.tl.types import (
    ChannelParticipantAdmin,
    ChannelParticipantCreator,
    ChatParticipantAdmin,
    ChatParticipantCreator,
    InputPeerChannel,
    InputPeerChat,
    User as TLUser,
    UserStatusLastMonth,
    UserStatusLastWeek,
    UserStatusOffline,
    UserStatusOnline,
    UserStatusRecently,
)

from app.models import ChatType, LastSeenBucket, TelegramAccount, TelegramChat, TelegramMember
from app.services.telegram.client_manager import client_manager

BATCH_SIZE = 500


def _bucket(status) -> LastSeenBucket:
    if isinstance(status, UserStatusOnline):
        return LastSeenBucket.online
    if isinstance(status, UserStatusRecently):
        return LastSeenBucket.recently
    if isinstance(status, UserStatusLastWeek):
        return LastSeenBucket.within_week
    if isinstance(status, UserStatusLastMonth):
        return LastSeenBucket.within_month
    if isinstance(status, UserStatusOffline):
        delta = datetime.now(timezone.utc) - status.was_online
        if delta.days < 1:
            return LastSeenBucket.recently
        if delta.days < 7:
            return LastSeenBucket.within_week
        if delta.days < 30:
            return LastSeenBucket.within_month
        return LastSeenBucket.long_ago
    return LastSeenBucket.hidden


class TelegramMemberService:
    """Loads participants Telegram exposes to the connected account. Phone numbers are never read or stored."""

    async def sync_members(self, db: AsyncSession, account: TelegramAccount, chat: TelegramChat, progress_cb=None) -> int:
        now = datetime.now(timezone.utc)
        total = 0
        batch: list[dict] = []
        seen_ids: set[int] = set()

        async def flush() -> None:
            if not batch:
                return
            stmt = pg_insert(TelegramMember).values(batch)
            stmt = stmt.on_conflict_do_update(
                constraint="uq_member_per_chat",
                set_={
                    "access_hash": stmt.excluded.access_hash,
                    "username": stmt.excluded.username,
                    "first_name": stmt.excluded.first_name,
                    "last_name": stmt.excluded.last_name,
                    "is_bot": stmt.excluded.is_bot,
                    "is_deleted": stmt.excluded.is_deleted,
                    "is_admin": stmt.excluded.is_admin,
                    "is_premium": stmt.excluded.is_premium,
                    "last_seen_bucket": stmt.excluded.last_seen_bucket,
                    "synced_at": stmt.excluded.synced_at,
                    "updated_at": now,
                },
            )
            await db.execute(stmt)
            batch.clear()

        # Build the peer from stored ids; a fresh session has no entity cache to resolve bare ids against.
        peer = InputPeerChat(chat_id=chat.telegram_chat_id) if chat.chat_type == ChatType.group else InputPeerChannel(channel_id=chat.telegram_chat_id, access_hash=chat.access_hash or 0)

        async with client_manager.for_account(account) as client:
            async for participant in client.iter_participants(peer):
                if not isinstance(participant, TLUser):
                    continue
                p = getattr(participant, "participant", None)
                is_admin = isinstance(p, (ChannelParticipantAdmin, ChannelParticipantCreator, ChatParticipantAdmin, ChatParticipantCreator))
                seen_ids.add(participant.id)
                batch.append(
                    {
                        "telegram_chat_id": chat.id,
                        "telegram_user_id": participant.id,
                        "access_hash": participant.access_hash,
                        "username": participant.username,
                        "first_name": participant.first_name,
                        "last_name": participant.last_name,
                        "is_bot": bool(participant.bot),
                        "is_deleted": bool(participant.deleted),
                        "is_admin": is_admin,
                        "is_premium": bool(getattr(participant, "premium", False)),
                        "last_seen_bucket": _bucket(participant.status),
                        "synced_at": now,
                    }
                )
                total += 1
                if len(batch) >= BATCH_SIZE:
                    await flush()
                    if progress_cb:
                        await progress_cb(total)

        await flush()
        if seen_ids:
            await db.execute(delete(TelegramMember).where(TelegramMember.telegram_chat_id == chat.id, TelegramMember.telegram_user_id.not_in(seen_ids)))
        chat.members_synced_at = now
        chat.member_count = total or chat.member_count
        await db.commit()
        return total

    async def destination_member_ids(self, db: AsyncSession, destination_chat: TelegramChat) -> set[int]:
        rows = await db.scalars(select(TelegramMember.telegram_user_id).where(TelegramMember.telegram_chat_id == destination_chat.id))
        return set(rows.all())


telegram_member_service = TelegramMemberService()
