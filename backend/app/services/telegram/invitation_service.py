"""Performs a single Telegram-permitted invitation and reports exactly what Telegram answered."""

from dataclasses import dataclass

from telethon import TelegramClient
from telethon.tl.functions.channels import InviteToChannelRequest
from telethon.tl.functions.messages import AddChatUserRequest
from telethon.tl.types import InputPeerChannel, InputPeerChat, InputUser

from app.models import ChatType, TelegramChat, TelegramMember
from app.models.migration import MigrationMemberResult
from app.services.telegram.error_handler import ClassifiedError, classify_exception


@dataclass(frozen=True)
class InviteOutcome:
    result: MigrationMemberResult
    message: str
    telegram_error: str | None = None
    flood_wait_seconds: int | None = None
    pause_operation: bool = False

    @classmethod
    def from_error(cls, err: ClassifiedError) -> "InviteOutcome":
        return cls(err.result, err.message, err.telegram_error, err.flood_wait_seconds, err.pause_operation)


class TelegramInvitationService:
    @staticmethod
    def _input_user(member: TelegramMember) -> InputUser:
        return InputUser(user_id=member.telegram_user_id, access_hash=member.access_hash or 0)

    @staticmethod
    def _input_peer(chat: TelegramChat):
        if chat.chat_type == ChatType.group:
            return InputPeerChat(chat_id=chat.telegram_chat_id)
        return InputPeerChannel(channel_id=chat.telegram_chat_id, access_hash=chat.access_hash or 0)

    async def invite(self, client: TelegramClient, destination: TelegramChat, member: TelegramMember) -> InviteOutcome:
        try:
            user = self._input_user(member)
            if member.access_hash is None:
                user = await client.get_input_entity(member.telegram_user_id)

            if destination.chat_type == ChatType.group:
                result = await client(AddChatUserRequest(chat_id=destination.telegram_chat_id, user_id=user, fwd_limit=0))
            else:
                result = await client(InviteToChannelRequest(channel=self._input_peer(destination), users=[user]))

            # Newer layers return messages.InvitedUsers with a `missing_invitees` list instead of raising
            # for privacy-restricted users. Only trust success when Telegram did not list the user there.
            missing = getattr(result, "missing_invitees", None) or []
            for m in missing:
                if getattr(m, "user_id", None) == member.telegram_user_id:
                    reason = "Telegram did not allow this user to be invited because of their privacy settings."
                    if getattr(m, "premium_required_for_pm", False) or getattr(m, "premium_would_allow_invite", False):
                        reason = "Telegram reports this user only accepts invitations from Premium accounts."
                    return InviteOutcome(MigrationMemberResult.privacy_restricted, reason, "MissingInvitee")
            return InviteOutcome(MigrationMemberResult.success, "Added successfully")
        except Exception as exc:  # noqa: BLE001 — every Telegram response is classified and recorded
            return InviteOutcome.from_error(classify_exception(exc))


telegram_invitation_service = TelegramInvitationService()
