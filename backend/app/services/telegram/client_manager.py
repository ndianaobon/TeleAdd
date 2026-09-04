from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import HTTPException, status
from telethon import TelegramClient
from telethon.sessions import StringSession

from app.core.config import get_settings
from app.core.crypto import decrypt_secret
from app.models import TelegramAccount


class TelegramClientManager:
    """Builds Telethon clients from encrypted stored sessions. Never exposes the session string."""

    def __init__(self) -> None:
        self.settings = get_settings()

    def resolve_api_credentials(self, account: TelegramAccount | None = None, api_id: int | None = None, api_hash: str | None = None) -> tuple[int, str]:
        if account and account.api_id and account.api_hash_encrypted:
            return account.api_id, decrypt_secret(account.api_hash_encrypted)
        if api_id and api_hash:
            return api_id, api_hash
        if self.settings.telegram_api_id and self.settings.telegram_api_hash:
            return self.settings.telegram_api_id, self.settings.telegram_api_hash.get_secret_value()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Telegram API credentials are not configured. Add them in Settings → API Configuration.")

    def build(self, session_string: str | None, api_id: int, api_hash: str) -> TelegramClient:
        return TelegramClient(
            StringSession(session_string),
            api_id,
            api_hash,
            device_model=self.settings.telegram_device_model,
            app_version=self.settings.telegram_app_version,
            system_version="1.0",
            auto_reconnect=True,
            request_retries=2,
            flood_sleep_threshold=0,  # Never auto-sleep through flood waits: surface them so the operation pauses.
        )

    @asynccontextmanager
    async def for_account(self, account: TelegramAccount) -> AsyncIterator[TelegramClient]:
        if not account.session_encrypted:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "This Telegram account is not connected.")
        api_id, api_hash = self.resolve_api_credentials(account)
        client = self.build(decrypt_secret(account.session_encrypted), api_id, api_hash)
        await client.connect()
        try:
            if not await client.is_user_authorized():
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "The Telegram session has expired. Reconnect the account.")
            yield client
        finally:
            await client.disconnect()

    @asynccontextmanager
    async def ephemeral(self, session_string: str | None, api_id: int, api_hash: str) -> AsyncIterator[TelegramClient]:
        client = self.build(session_string, api_id, api_hash)
        await client.connect()
        try:
            yield client
        finally:
            await client.disconnect()


client_manager = TelegramClientManager()
