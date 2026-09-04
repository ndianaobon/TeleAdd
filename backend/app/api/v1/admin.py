from datetime import datetime, timedelta, timezone

from fastapi import APIRouter
from sqlalchemy import func, select

from app.core.deps import DB, AdminUser
from app.models import Migration, MigrationStatus, SystemEvent, TelegramAccount, TelegramAccountStatus, User

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/overview")
async def overview(db: DB, _: AdminUser):
    since = datetime.now(timezone.utc) - timedelta(days=30)

    async def count(stmt):
        return await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    return {
        "total_users": await count(select(User.id)),
        "active_users_30d": await count(select(User.id).where(User.last_login_at >= since)),
        "connected_telegram_accounts": await count(select(TelegramAccount.id).where(TelegramAccount.status == TelegramAccountStatus.connected)),
        "operations_30d": await count(select(Migration.id).where(Migration.created_at >= since)),
        "active_operations": await count(select(Migration.id).where(Migration.status.in_([MigrationStatus.running, MigrationStatus.queued, MigrationStatus.paused]))),
        "failed_operations_30d": await count(select(Migration.id).where(Migration.created_at >= since, Migration.status == MigrationStatus.failed)),
        "members_processed_30d": await db.scalar(select(func.coalesce(func.sum(Migration.processed), 0)).where(Migration.created_at >= since)),
        "successful_invitations_30d": await db.scalar(select(func.coalesce(func.sum(Migration.successful), 0)).where(Migration.created_at >= since)),
        "system_errors_24h": await count(select(SystemEvent.id).where(SystemEvent.level == "error", SystemEvent.created_at >= datetime.now(timezone.utc) - timedelta(days=1))),
    }


@router.get("/health")
async def service_health(_: AdminUser):
    from app.api.v1.health import full_health

    return await full_health()
