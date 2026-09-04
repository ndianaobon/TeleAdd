from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import encrypt_secret
from app.models import TelegramAccount, TelegramAccountStatus


class TelegramSessionManager:
    """Owns persistence of encrypted Telethon sessions. The plaintext session never leaves this module unencrypted."""

    @staticmethod
    def store(account: TelegramAccount, session_string: str, api_id: int, api_hash: str) -> None:
        account.session_encrypted = encrypt_secret(session_string)
        account.api_id = api_id
        account.api_hash_encrypted = encrypt_secret(api_hash)
        account.status = TelegramAccountStatus.connected
        account.last_active_at = datetime.now(timezone.utc)
        account.disconnected_at = None

    @staticmethod
    async def revoke(db: AsyncSession, account: TelegramAccount) -> None:
        account.session_encrypted = None
        account.api_hash_encrypted = None
        account.status = TelegramAccountStatus.disconnected
        account.disconnected_at = datetime.now(timezone.utc)
        await db.commit()

    @staticmethod
    async def mark_restricted(db: AsyncSession, account: TelegramAccount, until: datetime | None) -> None:
        account.status = TelegramAccountStatus.restricted
        account.restricted_until = until
        await db.commit()


session_manager = TelegramSessionManager()
