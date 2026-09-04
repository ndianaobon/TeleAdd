import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.telegram import ChatType, LastSeenBucket, TelegramAccountStatus


class StartTelegramAuthRequest(BaseModel):
    phone_number: str = Field(pattern=r"^\+?[0-9]{6,20}$", description="International format. Used only to request a login code; never persisted.")
    api_id: int | None = Field(default=None, description="Optional per-user Telegram API ID. Falls back to the platform default.")
    api_hash: str | None = Field(default=None, max_length=64)


class StartTelegramAuthResponse(BaseModel):
    auth_id: str
    code_sent_via: str


class SubmitTelegramCodeRequest(BaseModel):
    auth_id: str
    code: str = Field(min_length=3, max_length=10)


class SubmitTelegramPasswordRequest(BaseModel):
    auth_id: str
    password: str = Field(max_length=256)


class TelegramAuthStepResponse(BaseModel):
    status: str  # "code_required" | "password_required" | "authorized"
    account: "TelegramAccountOut | None" = None


class TelegramAccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    telegram_user_id: int | None
    username: str | None
    first_name: str | None
    last_name: str | None
    status: TelegramAccountStatus
    last_synced_at: datetime | None
    last_active_at: datetime | None
    restricted_until: datetime | None
    created_at: datetime


class TelegramChatOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    telegram_account_id: uuid.UUID
    telegram_chat_id: int
    title: str
    username: str | None
    chat_type: ChatType
    member_count: int | None
    is_admin: bool
    is_creator: bool
    can_invite_users: bool
    is_favorite: bool
    last_synced_at: datetime | None
    members_synced_at: datetime | None


class TelegramMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    telegram_user_id: int
    username: str | None
    first_name: str | None
    last_name: str | None
    is_bot: bool
    is_deleted: bool
    is_admin: bool
    is_premium: bool
    last_seen_bucket: LastSeenBucket
    eligibility: str = "eligible"


class PaginatedMembers(BaseModel):
    items: list[TelegramMemberOut]
    total: int
    page: int
    page_size: int


TelegramAuthStepResponse.model_rebuild()
