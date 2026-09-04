import pytest
from telethon import errors

from app.models.migration import MigrationMemberResult
from app.services.telegram.error_handler import classify_exception


@pytest.mark.parametrize(
    "exc, expected, pause",
    [
        (errors.UserPrivacyRestrictedError(request=None), MigrationMemberResult.privacy_restricted, False),
        (errors.UserNotMutualContactError(request=None), MigrationMemberResult.privacy_restricted, False),
        (errors.UserAlreadyParticipantError(request=None), MigrationMemberResult.already_member, False),
        (errors.ChatAdminRequiredError(request=None), MigrationMemberResult.permission_denied, True),
        (errors.ChatWriteForbiddenError(request=None), MigrationMemberResult.permission_denied, True),
        (errors.UserDeactivatedError(request=None), MigrationMemberResult.invalid_user, False),
        (errors.InputUserDeactivatedError(request=None), MigrationMemberResult.invalid_user, False),
        (errors.UserIdInvalidError(request=None), MigrationMemberResult.invalid_user, False),
        (errors.UserChannelsTooMuchError(request=None), MigrationMemberResult.failed, False),
        (errors.UserKickedError(request=None), MigrationMemberResult.failed, False),
        (errors.UserBotError(request=None), MigrationMemberResult.failed, False),
        (errors.PeerFloodError(request=None), MigrationMemberResult.flood_wait, True),
        (RuntimeError("boom"), MigrationMemberResult.failed, False),
    ],
)
def test_classification(exc, expected, pause):
    c = classify_exception(exc)
    assert c.result == expected
    assert c.pause_operation is pause
    assert c.message
    assert c.telegram_error


def test_flood_wait_carries_seconds_and_pauses():
    c = classify_exception(errors.FloodWaitError(request=None, capture=42))
    assert c.result == MigrationMemberResult.flood_wait
    assert c.flood_wait_seconds == 42
    assert c.pause_operation is True


def test_never_reports_success():
    for exc in (errors.UserPrivacyRestrictedError(request=None), errors.FloodWaitError(request=None, capture=1), RuntimeError()):
        assert classify_exception(exc).result != MigrationMemberResult.success
