import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.redis import get_redis, migration_control_key
from app.models import Migration, MigrationMember, MigrationMemberResult, MigrationStatus, TelegramAccount, TelegramChat, TelegramMember, User
from app.schemas.migration import CreateMigrationRequest, MigrationReview, SelectionRules
from app.services.audit import record_audit
from app.services.telegram.member_service import telegram_member_service

ACTIVE_STATUSES = {MigrationStatus.queued, MigrationStatus.running, MigrationStatus.paused}


def _load_options():
    return (selectinload(Migration.source_chat), selectinload(Migration.destination_chat), selectinload(Migration.telegram_account))


async def get_owned_migration(db: AsyncSession, user: User, migration_id: uuid.UUID) -> Migration:
    m = await db.scalar(select(Migration).options(*_load_options()).where(Migration.id == migration_id, Migration.user_id == user.id))
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Migration not found")
    return m


async def _owned_account(db: AsyncSession, user: User, account_id: uuid.UUID) -> TelegramAccount:
    acc = await db.scalar(select(TelegramAccount).where(TelegramAccount.id == account_id, TelegramAccount.user_id == user.id))
    if not acc or not acc.session_encrypted:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Connected Telegram account required")
    return acc


async def _account_chat(db: AsyncSession, account: TelegramAccount, chat_id: uuid.UUID) -> TelegramChat:
    chat = await db.scalar(select(TelegramChat).where(TelegramChat.id == chat_id, TelegramChat.telegram_account_id == account.id))
    if not chat:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Group not found for this Telegram account")
    return chat


def _apply_rules(members: list[TelegramMember], rules: SelectionRules, destination_ids: set[int]) -> tuple[list[TelegramMember], int]:
    kept: list[TelegramMember] = []
    excluded = 0
    for m in members:
        if (rules.exclude_bots and m.is_bot) or (rules.exclude_admins and m.is_admin) or (rules.exclude_deleted and m.is_deleted) or (rules.require_username and not m.username) or (rules.exclude_existing_destination_members and m.telegram_user_id in destination_ids):
            excluded += 1
            continue
        kept.append(m)
    return kept, excluded


async def previously_restricted_ids(db: AsyncSession, user: User, telegram_user_ids: list[int]) -> set[int]:
    if not telegram_user_ids:
        return set()
    rows = await db.scalars(
        select(MigrationMember.telegram_user_id)
        .join(Migration, Migration.id == MigrationMember.migration_id)
        .where(Migration.user_id == user.id, MigrationMember.result == MigrationMemberResult.privacy_restricted, MigrationMember.telegram_user_id.in_(telegram_user_ids))
    )
    return set(rows.all())


async def review(db: AsyncSession, user: User, body: CreateMigrationRequest) -> MigrationReview:
    account = await _owned_account(db, user, body.telegram_account_id)
    source = await _account_chat(db, account, body.source_chat_id)
    destination = await _account_chat(db, account, body.destination_chat_id)
    if source.id == destination.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Source and destination must differ")
    if not destination.can_invite_users:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The connected account cannot invite users to the destination group")

    members = (await db.scalars(select(TelegramMember).where(TelegramMember.id.in_(body.member_ids), TelegramMember.telegram_chat_id == source.id))).all()
    destination_ids = await telegram_member_service.destination_member_ids(db, destination)
    kept, excluded = _apply_rules(list(members), body.config.rules, destination_ids)
    already = sum(1 for m in kept if m.telegram_user_id in destination_ids)
    restricted = await previously_restricted_ids(db, user, [m.telegram_user_id for m in kept])
    return MigrationReview(
        selected=len(kept),
        known_eligible=len(kept) - already - len(restricted),
        potentially_restricted=len(restricted),
        already_in_destination=already,
        excluded_by_rules=excluded,
    )


async def create(db: AsyncSession, user: User, body: CreateMigrationRequest) -> Migration:
    account = await _owned_account(db, user, body.telegram_account_id)
    source = await _account_chat(db, account, body.source_chat_id)
    destination = await _account_chat(db, account, body.destination_chat_id)
    if source.id == destination.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Source and destination must differ")
    if not destination.can_invite_users:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The connected account cannot invite users to the destination group")

    active = await db.scalar(select(func.count()).select_from(Migration).where(Migration.telegram_account_id == account.id, Migration.status.in_(ACTIVE_STATUSES)))
    if active:
        raise HTTPException(status.HTTP_409_CONFLICT, "This Telegram account already has an active operation. Wait for it to finish or cancel it.")

    members = (await db.scalars(select(TelegramMember).where(TelegramMember.id.in_(body.member_ids), TelegramMember.telegram_chat_id == source.id))).all()
    destination_ids = await telegram_member_service.destination_member_ids(db, destination)
    kept, _ = _apply_rules(list(members), body.config.rules, destination_ids)
    if not kept:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No members remain after applying the selection rules")

    migration = Migration(
        user_id=user.id,
        telegram_account_id=account.id,
        source_chat_id=source.id,
        destination_chat_id=destination.id,
        name=body.name or f"{source.title} → {destination.title}",
        status=MigrationStatus.draft,
        config=body.config.model_dump(),
        total_selected=len(kept),
    )
    db.add(migration)
    await db.flush()
    db.add_all(
        MigrationMember(
            migration_id=migration.id,
            telegram_member_id=m.id,
            telegram_user_id=m.telegram_user_id,
            username=m.username,
            display_name=" ".join(filter(None, [m.first_name, m.last_name])) or None,
        )
        for m in kept
    )
    await record_audit(db, action="migration.create", user_id=user.id, resource_type="migration", resource_id=str(migration.id), details={"selected": len(kept)})
    await db.commit()
    return await get_owned_migration(db, user, migration.id)


async def start(db: AsyncSession, user: User, migration: Migration) -> Migration:
    if migration.status not in {MigrationStatus.draft, MigrationStatus.paused}:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Cannot start a migration in status '{migration.status.value}'")
    from app.workers.tasks import run_migration  # local import keeps Celery out of the API import graph until needed

    migration.status = MigrationStatus.queued
    migration.last_error = None
    if not migration.started_at:
        migration.started_at = datetime.now(timezone.utc)
    await get_redis().delete(migration_control_key(str(migration.id)))
    await record_audit(db, action="migration.start", user_id=user.id, resource_type="migration", resource_id=str(migration.id))
    await db.commit()
    task = run_migration.delay(str(migration.id))
    migration.worker_task_id = task.id
    await db.commit()
    return migration


async def pause(db: AsyncSession, user: User, migration: Migration) -> Migration:
    if migration.status not in {MigrationStatus.running, MigrationStatus.queued}:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only running operations can be paused")
    await get_redis().set(migration_control_key(str(migration.id)), "pause", ex=86400)
    await record_audit(db, action="migration.pause", user_id=user.id, resource_type="migration", resource_id=str(migration.id))
    await db.commit()
    return migration


async def cancel(db: AsyncSession, user: User, migration: Migration) -> Migration:
    if migration.status not in ACTIVE_STATUSES and migration.status != MigrationStatus.draft:
        raise HTTPException(status.HTTP_409_CONFLICT, "This operation is already finished")
    if migration.status in {MigrationStatus.draft, MigrationStatus.paused}:
        migration.status = MigrationStatus.cancelled
        migration.finished_at = datetime.now(timezone.utc)
    else:
        await get_redis().set(migration_control_key(str(migration.id)), "cancel", ex=86400)
    await record_audit(db, action="migration.cancel", user_id=user.id, resource_type="migration", resource_id=str(migration.id))
    await db.commit()
    return migration


async def delete_all_for_user(db: AsyncSession, user: User) -> int:
    rows = (await db.scalars(select(Migration).where(Migration.user_id == user.id, Migration.status.not_in(ACTIVE_STATUSES)))).all()
    for m in rows:
        await db.delete(m)
    await record_audit(db, action="migration.delete_all", user_id=user.id, details={"count": len(rows)})
    await db.commit()
    return len(rows)
