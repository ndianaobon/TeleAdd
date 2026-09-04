import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.migration import MigrationMemberResult, MigrationStatus


class SelectionRules(BaseModel):
    exclude_bots: bool = True
    exclude_admins: bool = True
    exclude_deleted: bool = True
    exclude_existing_destination_members: bool = True
    require_username: bool = False


class MigrationConfig(BaseModel):
    rules: SelectionRules = Field(default_factory=SelectionRules)
    cooldown_seconds: int = Field(default=8, ge=3, le=600)


class CreateMigrationRequest(BaseModel):
    name: str | None = Field(default=None, max_length=256)
    telegram_account_id: uuid.UUID
    source_chat_id: uuid.UUID
    destination_chat_id: uuid.UUID
    member_ids: list[uuid.UUID] = Field(min_length=1, max_length=50_000)
    config: MigrationConfig = Field(default_factory=MigrationConfig)


class ChatRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    username: str | None


class AccountRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str | None


class MigrationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    status: MigrationStatus
    source_chat: ChatRef | None
    destination_chat: ChatRef | None
    telegram_account: AccountRef
    config: dict
    total_selected: int
    processed: int
    successful: int
    already_member: int
    privacy_restricted: int
    failed: int
    skipped: int
    created_at: datetime
    started_at: datetime | None
    paused_at: datetime | None
    finished_at: datetime | None
    last_error: str | None


class MigrationMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    telegram_user_id: int
    username: str | None
    display_name: str | None
    result: MigrationMemberResult
    telegram_error: str | None
    flood_wait_seconds: int | None
    processed_at: datetime | None


class PaginatedMigrationMembers(BaseModel):
    items: list[MigrationMemberOut]
    total: int
    page: int
    page_size: int


class MigrationReview(BaseModel):
    selected: int
    known_eligible: int
    potentially_restricted: int
    already_in_destination: int
    excluded_by_rules: int
