"""Invitation outcomes with a fake Telethon client. No real Telegram traffic."""

import uuid
from types import SimpleNamespace

from telethon import errors

from app.models import ChatType, TelegramChat, TelegramMember
from app.models.migration import MigrationMemberResult
from app.services.telegram.invitation_service import telegram_invitation_service


class FakeClient:
    def __init__(self, response=None, raises: Exception | None = None):
        self.response = response
        self.raises = raises
        self.calls = []

    async def __call__(self, request):
        self.calls.append(request)
        if self.raises:
            raise self.raises
        return self.response

    async def get_input_entity(self, _):
        raise errors.PeerIdInvalidError(request=None)


def _dest(chat_type=ChatType.supergroup) -> TelegramChat:
    return TelegramChat(id=uuid.uuid4(), telegram_account_id=uuid.uuid4(), telegram_chat_id=1001, access_hash=123, title="Dest", chat_type=chat_type)


def _member(access_hash=555) -> TelegramMember:
    return TelegramMember(id=uuid.uuid4(), telegram_chat_id=uuid.uuid4(), telegram_user_id=42, access_hash=access_hash, username="someone")


async def test_success_when_telegram_confirms():
    client = FakeClient(response=SimpleNamespace(missing_invitees=[]))
    out = await telegram_invitation_service.invite(client, _dest(), _member())
    assert out.result == MigrationMemberResult.success
    assert len(client.calls) == 1


async def test_missing_invitee_is_privacy_restricted_not_success():
    client = FakeClient(response=SimpleNamespace(missing_invitees=[SimpleNamespace(user_id=42, premium_required_for_pm=False)]))
    out = await telegram_invitation_service.invite(client, _dest(), _member())
    assert out.result == MigrationMemberResult.privacy_restricted


async def test_privacy_error_recorded():
    client = FakeClient(raises=errors.UserPrivacyRestrictedError(request=None))
    out = await telegram_invitation_service.invite(client, _dest(), _member())
    assert out.result == MigrationMemberResult.privacy_restricted
    assert out.telegram_error == "UserPrivacyRestrictedError"


async def test_flood_wait_pauses():
    client = FakeClient(raises=errors.FloodWaitError(request=None, capture=120))
    out = await telegram_invitation_service.invite(client, _dest(), _member())
    assert out.result == MigrationMemberResult.flood_wait
    assert out.flood_wait_seconds == 120
    assert out.pause_operation


async def test_already_member():
    client = FakeClient(raises=errors.UserAlreadyParticipantError(request=None))
    out = await telegram_invitation_service.invite(client, _dest(), _member())
    assert out.result == MigrationMemberResult.already_member


async def test_permission_denied_pauses():
    client = FakeClient(raises=errors.ChatAdminRequiredError(request=None))
    out = await telegram_invitation_service.invite(client, _dest(), _member())
    assert out.result == MigrationMemberResult.permission_denied
    assert out.pause_operation


async def test_unresolvable_user_is_invalid():
    client = FakeClient(response=SimpleNamespace(missing_invitees=[]))
    out = await telegram_invitation_service.invite(client, _dest(), _member(access_hash=None))
    assert out.result == MigrationMemberResult.invalid_user


async def test_basic_group_uses_add_chat_user():
    from telethon.tl.functions.messages import AddChatUserRequest

    client = FakeClient(response=SimpleNamespace())
    out = await telegram_invitation_service.invite(client, _dest(ChatType.group), _member())
    assert out.result == MigrationMemberResult.success
    assert isinstance(client.calls[0], AddChatUserRequest)
