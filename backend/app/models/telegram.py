import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, Enum, ForeignKey, Integer, LargeBinary, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class TelegramAccountStatus(str, enum.Enum):
    pending = "pending"
    connected = "connected"
    disconnected = "disconnected"
    restricted = "restricted"


class ChatType(str, enum.Enum):
    group = "group"
    supergroup = "supergroup"
    channel = "channel"


class LastSeenBucket(str, enum.Enum):
    online = "online"
    recently = "recently"
    within_week = "within_week"
    within_month = "within_month"
    long_ago = "long_ago"
    hidden = "hidden"


class TelegramAccount(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "telegram_accounts"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    telegram_user_id: Mapped[int | None] = mapped_column(BigInteger, index=True)
    username: Mapped[str | None] = mapped_column(String(64))
    first_name: Mapped[str | None] = mapped_column(String(128))
    last_name: Mapped[str | None] = mapped_column(String(128))
    status: Mapped[TelegramAccountStatus] = mapped_column(Enum(TelegramAccountStatus, native_enum=False, length=16), default=TelegramAccountStatus.pending, nullable=False, index=True)
    # Telethon StringSession, encrypted with Fernet. Never returned by the API or written to logs.
    session_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary)
    api_id: Mapped[int | None] = mapped_column(Integer)
    api_hash_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    restricted_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    disconnected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship(back_populates="telegram_accounts")  # noqa: F821
    chats: Mapped[list["TelegramChat"]] = relationship(back_populates="account", cascade="all, delete-orphan")


class TelegramChat(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "telegram_chats"
    __table_args__ = (UniqueConstraint("telegram_account_id", "telegram_chat_id", name="uq_chat_per_account"),)

    telegram_account_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("telegram_accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    telegram_chat_id: Mapped[int] = mapped_column(BigInteger, index=True, nullable=False)
    access_hash: Mapped[int | None] = mapped_column(BigInteger)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    username: Mapped[str | None] = mapped_column(String(64))
    chat_type: Mapped[ChatType] = mapped_column(Enum(ChatType, native_enum=False, length=16), nullable=False)
    member_count: Mapped[int | None] = mapped_column(Integer)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_creator: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_invite_users: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    admin_rights: Mapped[dict | None] = mapped_column(JSON)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    members_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    account: Mapped[TelegramAccount] = relationship(back_populates="chats")
    members: Mapped[list["TelegramMember"]] = relationship(back_populates="chat", cascade="all, delete-orphan")


class TelegramMember(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "telegram_members"
    __table_args__ = (UniqueConstraint("telegram_chat_id", "telegram_user_id", name="uq_member_per_chat"),)

    telegram_chat_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("telegram_chats.id", ondelete="CASCADE"), index=True, nullable=False)
    telegram_user_id: Mapped[int] = mapped_column(BigInteger, index=True, nullable=False)
    access_hash: Mapped[int | None] = mapped_column(BigInteger)
    username: Mapped[str | None] = mapped_column(String(64), index=True)
    first_name: Mapped[str | None] = mapped_column(String(128))
    last_name: Mapped[str | None] = mapped_column(String(128))
    is_bot: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_premium: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_seen_bucket: Mapped[LastSeenBucket] = mapped_column(Enum(LastSeenBucket, native_enum=False, length=16), default=LastSeenBucket.hidden, nullable=False)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    chat: Mapped[TelegramChat] = relationship(back_populates="members")
