import uuid

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import DB, CurrentUser
from app.models import TelegramAccount, TelegramChat
from app.schemas.telegram import TelegramChatOut
from app.services.telegram.chat_service import telegram_chat_service

router = APIRouter(prefix="/groups", tags=["groups"])


async def _owned_account(db, user, account_id: uuid.UUID) -> TelegramAccount:
    acc = await db.scalar(select(TelegramAccount).where(TelegramAccount.id == account_id, TelegramAccount.user_id == user.id))
    if not acc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Telegram account not found")
    return acc


async def owned_chat(db, user, chat_id: uuid.UUID) -> TelegramChat:
    chat = await db.scalar(select(TelegramChat).join(TelegramAccount).where(TelegramChat.id == chat_id, TelegramAccount.user_id == user.id))
    if not chat:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Group not found")
    return chat


@router.get("", response_model=list[TelegramChatOut])
async def list_groups(db: DB, user: CurrentUser, account_id: uuid.UUID | None = Query(default=None), q: str | None = Query(default=None, max_length=100)):
    stmt = select(TelegramChat).join(TelegramAccount).where(TelegramAccount.user_id == user.id)
    if account_id:
        stmt = stmt.where(TelegramChat.telegram_account_id == account_id)
    if q:
        stmt = stmt.where(TelegramChat.title.ilike(f"%{q}%") | TelegramChat.username.ilike(f"%{q}%"))
    stmt = stmt.order_by(TelegramChat.is_favorite.desc(), TelegramChat.member_count.desc().nulls_last())
    return (await db.scalars(stmt)).all()


@router.post("/sync", response_model=list[TelegramChatOut])
async def sync_groups(db: DB, user: CurrentUser, account_id: uuid.UUID = Query()):
    account = await _owned_account(db, user, account_id)
    return await telegram_chat_service.sync_chats(db, account)


@router.get("/{chat_id}", response_model=TelegramChatOut)
async def get_group(chat_id: uuid.UUID, db: DB, user: CurrentUser):
    return await owned_chat(db, user, chat_id)


class FavoriteBody(BaseModel):
    is_favorite: bool


@router.patch("/{chat_id}/favorite", response_model=TelegramChatOut)
async def set_favorite(chat_id: uuid.UUID, body: FavoriteBody, db: DB, user: CurrentUser):
    chat = await owned_chat(db, user, chat_id)
    chat.is_favorite = body.is_favorite
    await db.commit()
    return chat
