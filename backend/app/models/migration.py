import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, BigInteger, DateTime, Enum, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class MigrationStatus(str, enum.Enum):
    draft = "draft"
    queued = "queued"
    running = "running"
    paused = "paused"
    completed = "completed"
    cancelled = "cancelled"
    failed = "failed"


class MigrationMemberResult(str, enum.Enum):
    pending = "pending"
    success = "success"
    already_member = "already_member"
    privacy_restricted = "privacy_restricted"
    permission_denied = "permission_denied"
    flood_wait = "flood_wait"
    invalid_user = "invalid_user"
    failed = "failed"
    skipped = "skipped"


class Migration(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "migrations"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    telegram_account_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("telegram_accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    source_chat_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("telegram_chats.id", ondelete="SET NULL"), index=True, nullable=True)
    destination_chat_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("telegram_chats.id", ondelete="SET NULL"), index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    status: Mapped[MigrationStatus] = mapped_column(Enum(MigrationStatus, native_enum=False, length=16), default=MigrationStatus.draft, nullable=False, index=True)
    config: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)

    total_selected: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    processed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    successful: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    already_member: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    privacy_restricted: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    skipped: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    worker_task_id: Mapped[str | None] = mapped_column(String(128))

    source_chat: Mapped["TelegramChat | None"] = relationship(foreign_keys=[source_chat_id])  # noqa: F821
    destination_chat: Mapped["TelegramChat | None"] = relationship(foreign_keys=[destination_chat_id])  # noqa: F821
    telegram_account: Mapped["TelegramAccount"] = relationship()  # noqa: F821
    members: Mapped[list["MigrationMember"]] = relationship(back_populates="migration", cascade="all, delete-orphan")


class MigrationMember(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "migration_members"

    migration_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("migrations.id", ondelete="CASCADE"), index=True, nullable=False)
    telegram_member_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("telegram_members.id", ondelete="SET NULL"), index=True)
    telegram_user_id: Mapped[int] = mapped_column(BigInteger, index=True, nullable=False)
    username: Mapped[str | None] = mapped_column(String(64))
    display_name: Mapped[str | None] = mapped_column(String(256))
    result: Mapped[MigrationMemberResult] = mapped_column(Enum(MigrationMemberResult, native_enum=False, length=24), default=MigrationMemberResult.pending, nullable=False, index=True)
    telegram_error: Mapped[str | None] = mapped_column(Text)
    flood_wait_seconds: Mapped[int | None] = mapped_column(Integer)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    migration: Mapped[Migration] = relationship(back_populates="members")
    member: Mapped["TelegramMember | None"] = relationship()  # noqa: F821
