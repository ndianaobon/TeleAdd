import csv
import io
import uuid
from datetime import datetime

from fastapi import APIRouter, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.deps import DB, CurrentUser
from app.models import Migration, MigrationMember, MigrationMemberResult, MigrationStatus
from app.schemas.migration import CreateMigrationRequest, MigrationMemberOut, MigrationOut, MigrationReview, PaginatedMigrationMembers
from app.services import migration_service

router = APIRouter(prefix="/migrations", tags=["migrations"])


@router.post("/review", response_model=MigrationReview)
async def review_migration(body: CreateMigrationRequest, db: DB, user: CurrentUser):
    return await migration_service.review(db, user, body)


@router.post("", response_model=MigrationOut, status_code=status.HTTP_201_CREATED)
async def create_migration(body: CreateMigrationRequest, db: DB, user: CurrentUser):
    return await migration_service.create(db, user, body)


@router.get("", response_model=list[MigrationOut])
async def list_migrations(
    db: DB,
    user: CurrentUser,
    status_filter: MigrationStatus | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None, max_length=100),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    stmt = select(Migration).options(selectinload(Migration.source_chat), selectinload(Migration.destination_chat), selectinload(Migration.telegram_account)).where(Migration.user_id == user.id)
    if status_filter:
        stmt = stmt.where(Migration.status == status_filter)
    if q:
        stmt = stmt.where(Migration.name.ilike(f"%{q}%"))
    if date_from:
        stmt = stmt.where(Migration.created_at >= date_from)
    if date_to:
        stmt = stmt.where(Migration.created_at <= date_to)
    return (await db.scalars(stmt.order_by(Migration.created_at.desc()).offset(offset).limit(limit))).all()


@router.get("/{migration_id}", response_model=MigrationOut)
async def get_migration(migration_id: uuid.UUID, db: DB, user: CurrentUser):
    return await migration_service.get_owned_migration(db, user, migration_id)


@router.post("/{migration_id}/start", response_model=MigrationOut)
async def start_migration(migration_id: uuid.UUID, db: DB, user: CurrentUser):
    m = await migration_service.get_owned_migration(db, user, migration_id)
    return await migration_service.start(db, user, m)


@router.post("/{migration_id}/pause", response_model=MigrationOut)
async def pause_migration(migration_id: uuid.UUID, db: DB, user: CurrentUser):
    m = await migration_service.get_owned_migration(db, user, migration_id)
    return await migration_service.pause(db, user, m)


@router.post("/{migration_id}/cancel", response_model=MigrationOut)
async def cancel_migration(migration_id: uuid.UUID, db: DB, user: CurrentUser):
    m = await migration_service.get_owned_migration(db, user, migration_id)
    return await migration_service.cancel(db, user, m)


@router.get("/{migration_id}/members", response_model=PaginatedMigrationMembers)
async def migration_members(
    migration_id: uuid.UUID,
    db: DB,
    user: CurrentUser,
    result: MigrationMemberResult | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
):
    m = await migration_service.get_owned_migration(db, user, migration_id)
    stmt = select(MigrationMember).where(MigrationMember.migration_id == m.id)
    if result:
        stmt = stmt.where(MigrationMember.result == result)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = (await db.scalars(stmt.order_by(MigrationMember.processed_at.desc().nulls_last(), MigrationMember.created_at).offset((page - 1) * page_size).limit(page_size))).all()
    return PaginatedMigrationMembers(items=[MigrationMemberOut.model_validate(r) for r in rows], total=total, page=page, page_size=page_size)


@router.get("/{migration_id}/export.csv")
async def export_csv(migration_id: uuid.UUID, db: DB, user: CurrentUser):
    m = await migration_service.get_owned_migration(db, user, migration_id)
    rows = (await db.scalars(select(MigrationMember).where(MigrationMember.migration_id == m.id).order_by(MigrationMember.created_at))).all()

    def generate():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["telegram_user_id", "username", "display_name", "result", "telegram_error", "flood_wait_seconds", "processed_at"])
        yield buf.getvalue()
        for r in rows:
            buf.seek(0)
            buf.truncate()
            writer.writerow([r.telegram_user_id, r.username or "", r.display_name or "", r.result.value, r.telegram_error or "", r.flood_wait_seconds or "", r.processed_at.isoformat() if r.processed_at else ""])
            yield buf.getvalue()

    filename = f"migration-{m.id}.csv"
    return StreamingResponse(generate(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.delete("", status_code=status.HTTP_200_OK)
async def delete_all_migration_data(db: DB, user: CurrentUser):
    deleted = await migration_service.delete_all_for_user(db, user)
    return {"deleted": deleted}
