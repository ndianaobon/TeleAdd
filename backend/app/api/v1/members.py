import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select

from app.api.v1.groups import owned_chat
from app.core.deps import DB, CurrentUser
from app.models import TelegramMember
from app.schemas.telegram import PaginatedMembers, TelegramMemberOut
from app.services.migration_service import previously_restricted_ids
from app.services.telegram.member_service import telegram_member_service

router = APIRouter(prefix="/groups/{chat_id}/members", tags=["members"])

Filter = Literal["all", "eligible", "restricted", "already_member", "admins", "bots", "deleted"]
MAX_SELECT_ALL = 50_000


def _base_query(chat_id: uuid.UUID, q: str | None, flt: Filter, dest_ids: set[int] | None, restricted_ids: set[int]):
    stmt = select(TelegramMember).where(TelegramMember.telegram_chat_id == chat_id)
    if q:
        like = f"%{q}%"
        conds = [TelegramMember.username.ilike(like), TelegramMember.first_name.ilike(like), TelegramMember.last_name.ilike(like)]
        if q.isdigit():
            conds.append(TelegramMember.telegram_user_id == int(q))
        stmt = stmt.where(or_(*conds))
    if flt == "admins":
        stmt = stmt.where(TelegramMember.is_admin.is_(True))
    elif flt == "bots":
        stmt = stmt.where(TelegramMember.is_bot.is_(True))
    elif flt == "deleted":
        stmt = stmt.where(TelegramMember.is_deleted.is_(True))
    elif flt == "already_member":
        stmt = stmt.where(TelegramMember.telegram_user_id.in_(dest_ids or {-1}))
    elif flt == "restricted":
        stmt = stmt.where(TelegramMember.telegram_user_id.in_(restricted_ids or {-1}))
    elif flt == "eligible":
        stmt = stmt.where(TelegramMember.is_bot.is_(False), TelegramMember.is_deleted.is_(False), TelegramMember.is_admin.is_(False))
        if dest_ids:
            stmt = stmt.where(TelegramMember.telegram_user_id.not_in(dest_ids))
        if restricted_ids:
            stmt = stmt.where(TelegramMember.telegram_user_id.not_in(restricted_ids))
    return stmt


def _eligibility(m: TelegramMember, dest_ids: set[int] | None, restricted_ids: set[int]) -> str:
    if m.is_deleted:
        return "deleted"
    if m.is_bot:
        return "bot"
    if m.is_admin:
        return "admin"
    if dest_ids and m.telegram_user_id in dest_ids:
        return "already_member"
    if m.telegram_user_id in restricted_ids:
        return "restricted"
    return "eligible"


@router.get("", response_model=PaginatedMembers)
async def list_members(
    chat_id: uuid.UUID,
    db: DB,
    user: CurrentUser,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    q: str | None = Query(default=None, max_length=100),
    filter: Filter = Query(default="all"),
    destination_chat_id: uuid.UUID | None = Query(default=None),
):
    chat = await owned_chat(db, user, chat_id)
    dest_ids: set[int] | None = None
    if destination_chat_id:
        dest = await owned_chat(db, user, destination_chat_id)
        dest_ids = await telegram_member_service.destination_member_ids(db, dest)

    # Restricted = users Telegram previously rejected for privacy reasons in this user's operations.
    all_ids = (await db.scalars(select(TelegramMember.telegram_user_id).where(TelegramMember.telegram_chat_id == chat.id))).all()
    restricted_ids = await previously_restricted_ids(db, user, list(all_ids))

    stmt = _base_query(chat.id, q, filter, dest_ids, restricted_ids)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = (await db.scalars(stmt.order_by(TelegramMember.is_admin.desc(), TelegramMember.username.nulls_last(), TelegramMember.telegram_user_id).offset((page - 1) * page_size).limit(page_size))).all()
    items = [TelegramMemberOut.model_validate(m).model_copy(update={"eligibility": _eligibility(m, dest_ids, restricted_ids)}) for m in rows]
    return PaginatedMembers(items=items, total=total, page=page, page_size=page_size)


@router.get("/ids", response_model=list[uuid.UUID])
async def list_member_ids(
    chat_id: uuid.UUID,
    db: DB,
    user: CurrentUser,
    q: str | None = Query(default=None, max_length=100),
    filter: Filter = Query(default="all"),
    destination_chat_id: uuid.UUID | None = Query(default=None),
):
    """Ids of every member matching the current filter — powers "select all" without paging through rows."""
    chat = await owned_chat(db, user, chat_id)
    dest_ids = None
    if destination_chat_id:
        dest = await owned_chat(db, user, destination_chat_id)
        dest_ids = await telegram_member_service.destination_member_ids(db, dest)
    all_ids = (await db.scalars(select(TelegramMember.telegram_user_id).where(TelegramMember.telegram_chat_id == chat.id))).all()
    restricted_ids = await previously_restricted_ids(db, user, list(all_ids))
    stmt = _base_query(chat.id, q, filter, dest_ids, restricted_ids).with_only_columns(TelegramMember.id).limit(MAX_SELECT_ALL)
    return (await db.scalars(stmt)).all()


@router.post("/sync", status_code=status.HTTP_202_ACCEPTED)
async def sync_members(chat_id: uuid.UUID, db: DB, user: CurrentUser):
    chat = await owned_chat(db, user, chat_id)
    from app.workers.tasks import sync_members as sync_task

    task = sync_task.delay(str(chat.telegram_account_id), str(chat.id))
    return {"task_id": task.id, "channel": f"chat:{chat.id}:sync"}


@router.get("/{member_id}", response_model=TelegramMemberOut)
async def get_member(chat_id: uuid.UUID, member_id: uuid.UUID, db: DB, user: CurrentUser, destination_chat_id: uuid.UUID | None = Query(default=None)):
    chat = await owned_chat(db, user, chat_id)
    m = await db.scalar(select(TelegramMember).where(TelegramMember.id == member_id, TelegramMember.telegram_chat_id == chat.id))
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
    dest_ids = None
    if destination_chat_id:
        dest = await owned_chat(db, user, destination_chat_id)
        dest_ids = await telegram_member_service.destination_member_ids(db, dest)
    restricted_ids = await previously_restricted_ids(db, user, [m.telegram_user_id])
    return TelegramMemberOut.model_validate(m).model_copy(update={"eligibility": _eligibility(m, dest_ids, restricted_ids)})
