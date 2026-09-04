"""Maps Telegram's actual responses to application result codes.

Telegram's answer is authoritative. Nothing here retries around a restriction,
shortens a wait, or reinterprets a rejection as a success.
"""

from dataclasses import dataclass

from telethon import errors

from app.models.migration import MigrationMemberResult


@dataclass(frozen=True)
class ClassifiedError:
    result: MigrationMemberResult
    message: str
    telegram_error: str
    flood_wait_seconds: int | None = None
    pause_operation: bool = False


_PRIVACY = {
    errors.UserPrivacyRestrictedError: "Telegram did not allow this user to be invited because of their privacy settings.",
    errors.UserNotMutualContactError: "Telegram requires a mutual contact to invite this user into a basic group.",
}
_PERMISSION = {
    errors.ChatAdminRequiredError: "The connected Telegram account does not have sufficient permissions in the destination.",
    errors.ChatWriteForbiddenError: "The connected Telegram account cannot write to the destination group.",
    errors.UserRestrictedError: "Telegram has restricted the connected account from inviting users.",
    errors.RightForbiddenError: "The connected account lacks the right to invite users to this group.",
}
_INVALID = {
    errors.UserDeactivatedError: "The Telegram user is no longer available.",
    errors.InputUserDeactivatedError: "The Telegram user account has been deactivated.",
    errors.UserIdInvalidError: "The Telegram user is no longer available.",
    errors.PeerIdInvalidError: "Telegram could not resolve this user.",
    errors.UserDeactivatedBanError: "The Telegram user account has been banned.",
}
_FAILED = {
    errors.UserAlreadyParticipantError: "This user is already a member of the destination group.",
    errors.UserChannelsTooMuchError: "This user is a member of too many channels and cannot be added.",
    errors.UserKickedError: "This user was previously removed from the destination and cannot be re-added by invitation.",
    errors.UserBannedInChannelError: "The connected account is banned from inviting users in this channel.",
    errors.UsersTooMuchError: "The destination group has reached its member limit.",
    errors.UserBotError: "Bots can only be added as administrators.",
    errors.ChannelPrivateError: "The destination channel is private or inaccessible to this account.",
    errors.ChatIdInvalidError: "The destination chat is invalid.",
    errors.InviteHashExpiredError: "The invitation could not be completed.",
}


def classify_exception(exc: Exception) -> ClassifiedError:
    name = type(exc).__name__

    if isinstance(exc, errors.FloodWaitError):
        return ClassifiedError(
            result=MigrationMemberResult.flood_wait,
            message="Telegram has temporarily restricted this operation. The task has been paused.",
            telegram_error=f"{name}: wait {exc.seconds}s",
            flood_wait_seconds=int(exc.seconds),
            pause_operation=True,
        )
    if isinstance(exc, errors.PeerFloodError):
        return ClassifiedError(
            result=MigrationMemberResult.flood_wait,
            message="Telegram's anti-spam system has limited this account. The task has been paused; try again later.",
            telegram_error=name,
            pause_operation=True,
        )
    if isinstance(exc, errors.UserAlreadyParticipantError):
        return ClassifiedError(MigrationMemberResult.already_member, _FAILED[errors.UserAlreadyParticipantError], name)
    if isinstance(exc, (errors.SessionRevokedError, errors.AuthKeyUnregisteredError)):
        return ClassifiedError(MigrationMemberResult.permission_denied, "The Telegram session is no longer valid. Reconnect the account.", name, pause_operation=True)

    for table, result in ((_PRIVACY, MigrationMemberResult.privacy_restricted), (_PERMISSION, MigrationMemberResult.permission_denied), (_INVALID, MigrationMemberResult.invalid_user), (_FAILED, MigrationMemberResult.failed)):
        for exc_type, message in table.items():
            if isinstance(exc, exc_type):
                pause = result == MigrationMemberResult.permission_denied
                return ClassifiedError(result, message, name, pause_operation=pause)

    if isinstance(exc, errors.RPCError):
        return ClassifiedError(MigrationMemberResult.failed, "Telegram returned an error for this user.", f"{name}: {exc}")
    return ClassifiedError(MigrationMemberResult.failed, "The operation failed unexpectedly.", f"{name}: {exc}")
