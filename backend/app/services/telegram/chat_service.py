from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from telethon.tl.types import Channel, Chat

from app.models import ChatType, TelegramAccount, TelegramChat
from app.services.telegram.client_manager import client_manager


def _admin_rights_dict(rights) -> dict | None:
    if rights is None:
        return None
    return {k: bool(v) for k, v in rights.to_dict().items() if k != "_" and isinstance(v, bool)}


class TelegramChatService:
    """Discovers groups/channels the connected account can access and records its permissions in each."""

    async def sync_chats(self, db: AsyncSession, account: TelegramAccount) -> list[TelegramChat]:
        existing = {c.telegram_chat_id: c for c in (await db.scalars(select(TelegramChat).where(TelegramChat.telegram_account_id == account.id))).all()}
        seen: set[int] = set()
        now = datetime.now(timezone.utc)

        async with client_manager.for_account(account) as client:
            async for dialog in client.iter_dialogs():
                entity = dialog.entity
                if isinstance(entity, Channel):
                    if entity.left:
                        continue
                    chat_type = ChatType.supergroup if entity.megagroup else ChatType.channel
                    access_hash = entity.access_hash
                    username = entity.username
                elif isinstance(entity, Chat):
                    if entity.deactivated or entity.left:
                        continue
                    chat_type = ChatType.group
                    access_hash = None
                    username = None
                else:
                    continue

                is_creator = bool(entity.creator)
                rights = entity.admin_rights
                is_admin = is_creator or rights is not None
                member_count = entity.participants_count
                # default_banned_rights.invite_users == True means ordinary members are *forbidden* from inviting.
                if is_creator:
                    can_invite = True
                elif rights is not None:
                    can_invite = bool(rights.invite_users)
                elif chat_type == ChatType.channel:
                    can_invite = False
                else:
                    dbr = entity.default_banned_rights
                    can_invite = not (dbr and dbr.invite_users)

                seen.add(entity.id)
                chat = existing.get(entity.id)
                if not chat:
                    chat = TelegramChat(telegram_account_id=account.id, telegram_chat_id=entity.id, title=entity.title or "", chat_type=chat_type)
                    db.add(chat)
                    existing[entity.id] = chat
                chat.title = entity.title or ""
                chat.username = username
                chat.chat_type = chat_type
                chat.member_count = member_count
                chat.access_hash = access_hash
                chat.is_admin = is_admin
                chat.is_creator = is_creator
                chat.can_invite_users = can_invite
                chat.admin_rights = _admin_rights_dict(rights)
                chat.last_synced_at = now

        # Chats the account no longer has in its dialogs are removed (members cascade).
        for chat_id, chat in list(existing.items()):
            if chat_id not in seen:
                await db.delete(chat)

        account.last_synced_at = now
        await db.commit()
        return [existing[c] for c in seen if c in existing]


telegram_chat_service = TelegramChatService()
