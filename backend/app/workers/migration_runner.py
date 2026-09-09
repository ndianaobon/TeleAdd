"""Executes one migration end-to-end inside a worker.

Every outcome written here comes from Telegram's response to a single invitation request.
Flood waits and permission failures pause the operation; nothing is retried around them.
"""

import asyncio
import json
import uuid
from datetime import datetime, timedelta, timezone

import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.redis import migration_control_key, migration_events_channel
from app.models import Migration, MigrationMember, MigrationMemberResult, MigrationStatus, TelegramAccountStatus
from app.services.telegram.client_manager import client_manager
from app.services.telegram.invitation_service import InviteOutcome, telegram_invitation_service

log = get_logger(__name__)


class MigrationRunner:
    def __init__(self, migration_id: str) -> None:
        self.migration_id = uuid.UUID(migration_id)
        self.settings = get_settings()
        # A fresh client per run, not the app-wide cached one: this runs inside its own
        # asyncio.run() per Celery task, and an asyncio Redis client can't outlive the
        # event loop it was opened on.
        self.redis = aioredis.from_url(self.settings.redis_url, decode_responses=True, protocol=2)
        self.channel = migration_events_channel(migration_id)
        self.control_key = migration_control_key(migration_id)

    async def _publish(self, payload: dict) -> None:
        payload.setdefault("migration_id", str(self.migration_id))
        payload.setdefault("at", datetime.now(timezone.utc).isoformat())
        await self.redis.publish(self.channel, json.dumps(payload, default=str))

    async def _control(self) -> str | None:
        return await self.redis.get(self.control_key)

    @staticmethod
    def _counters(m: Migration) -> dict:
        return {
            "total_selected": m.total_selected,
            "processed": m.processed,
            "successful": m.successful,
            "already_member": m.already_member,
            "privacy_restricted": m.privacy_restricted,
            "failed": m.failed,
            "skipped": m.skipped,
        }

    async def _set_status(self, db: AsyncSession, m: Migration, status: MigrationStatus, error: str | None = None) -> None:
        m.status = status
        now = datetime.now(timezone.utc)
        if status == MigrationStatus.paused:
            m.paused_at = now
        if status in {MigrationStatus.completed, MigrationStatus.cancelled, MigrationStatus.failed}:
            m.finished_at = now
        if error:
            m.last_error = error
        await db.commit()
        await self._publish({"type": "status_change", "status": status.value, "message": error, "counters": self._counters(m)})

    async def _sleep_with_control(self, seconds: float) -> str | None:
        deadline = asyncio.get_event_loop().time() + seconds
        while asyncio.get_event_loop().time() < deadline:
            control = await self._control()
            if control in {"cancel", "pause"}:
                return control
            await asyncio.sleep(min(1.0, deadline - asyncio.get_event_loop().time()))
        return None

    def _record(self, m: Migration, mm: MigrationMember, outcome: InviteOutcome) -> None:
        mm.result = outcome.result
        mm.telegram_error = outcome.telegram_error
        mm.flood_wait_seconds = outcome.flood_wait_seconds
        mm.attempt_count += 1
        mm.processed_at = datetime.now(timezone.utc)
        m.processed += 1
        if outcome.result == MigrationMemberResult.success:
            m.successful += 1
        elif outcome.result == MigrationMemberResult.already_member:
            m.already_member += 1
        elif outcome.result == MigrationMemberResult.privacy_restricted:
            m.privacy_restricted += 1
        elif outcome.result == MigrationMemberResult.skipped:
            m.skipped += 1
        else:
            m.failed += 1

    async def run(self) -> dict:
        engine = create_async_engine(self.settings.database_url, pool_pre_ping=True)
        Session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
        try:
            async with Session() as db:
                return await self._run(db)
        finally:
            await engine.dispose()
            await self.redis.aclose()

    async def _run(self, db: AsyncSession) -> dict:
        m = await db.scalar(select(Migration).options(selectinload(Migration.telegram_account), selectinload(Migration.destination_chat)).where(Migration.id == self.migration_id))
        if not m:
            return {"status": "not_found"}
        if m.status in {MigrationStatus.cancelled, MigrationStatus.completed, MigrationStatus.failed}:
            return {"status": m.status.value}
        if not m.destination_chat or not m.telegram_account or not m.telegram_account.session_encrypted:
            await self._set_status(db, m, MigrationStatus.failed, "Destination group or Telegram account is no longer available.")
            return {"status": "failed"}

        cooldown = int(m.config.get("cooldown_seconds") or self.settings.invite_cooldown_seconds)
        await self._set_status(db, m, MigrationStatus.running)
        log.info("migration_started", migration_id=str(m.id), total=m.total_selected)

        try:
            async with client_manager.for_account(m.telegram_account) as client:
                while True:
                    control = await self._control()
                    if control == "cancel":
                        await self._set_status(db, m, MigrationStatus.cancelled)
                        break
                    if control == "pause":
                        await self._set_status(db, m, MigrationStatus.paused)
                        break

                    mm = await db.scalar(
                        select(MigrationMember)
                        .options(selectinload(MigrationMember.member))
                        .where(MigrationMember.migration_id == m.id, MigrationMember.result == MigrationMemberResult.pending)
                        .order_by(MigrationMember.created_at)
                        .limit(1)
                    )
                    if mm is None:
                        await self._set_status(db, m, MigrationStatus.completed)
                        break
                    if mm.member is None:
                        self._record(m, mm, InviteOutcome(MigrationMemberResult.skipped, "Member record no longer available", "MemberMissing"))
                        await db.commit()
                        continue

                    await self._publish({"type": "processing", "telegram_user_id": mm.telegram_user_id, "username": mm.username})
                    outcome = await telegram_invitation_service.invite(client, m.destination_chat, mm.member)

                    if outcome.result == MigrationMemberResult.flood_wait:
                        mm.attempt_count += 1
                        mm.flood_wait_seconds = outcome.flood_wait_seconds
                        await db.commit()
                        seconds = outcome.flood_wait_seconds
                        if seconds is None or seconds > self.settings.max_flood_wait_seconds:
                            until = datetime.now(timezone.utc) + timedelta(seconds=seconds) if seconds else None
                            m.telegram_account.status = TelegramAccountStatus.restricted
                            m.telegram_account.restricted_until = until
                            await self._set_status(db, m, MigrationStatus.paused, outcome.message + (f" Telegram asked to wait {seconds}s." if seconds else ""))
                            break
                        await self._publish({"type": "flood_wait", "seconds": seconds, "resume_at": (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat(), "message": outcome.message})
                        log.warning("flood_wait", migration_id=str(m.id), seconds=seconds)
                        await self._sleep_with_control(seconds + 1)
                        continue  # re-check control, then retry the same member after Telegram's required wait

                    self._record(m, mm, outcome)
                    await db.commit()
                    await self._publish(
                        {
                            "type": "member_result",
                            "telegram_user_id": mm.telegram_user_id,
                            "username": mm.username,
                            "display_name": mm.display_name,
                            "result": outcome.result.value,
                            "message": outcome.message,
                            "telegram_error": outcome.telegram_error,
                            "counters": self._counters(m),
                        }
                    )

                    if outcome.pause_operation:
                        await self._set_status(db, m, MigrationStatus.paused, outcome.message)
                        break

                    if await self._sleep_with_control(cooldown):
                        continue
        except Exception as exc:  # noqa: BLE001
            log.exception("migration_crashed", migration_id=str(m.id), error=type(exc).__name__)
            await self._set_status(db, m, MigrationStatus.paused, f"The operation stopped unexpectedly ({type(exc).__name__}). You can resume it.")
            return {"status": "paused", "error": type(exc).__name__}

        await self.redis.delete(self.control_key)
        return {"status": m.status.value, **self._counters(m)}
