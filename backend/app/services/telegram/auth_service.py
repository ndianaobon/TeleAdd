"""Telegram login flow (phone → code → optional 2FA).

Pending state lives only in Redis with a short TTL and is encrypted. Verification codes
and 2FA passwords are forwarded to Telegram and never stored or logged.
"""

import json
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from telethon import errors
from telethon.sessions import StringSession

from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.logging import get_logger
from app.core.redis import get_redis, pending_auth_key
from app.models import TelegramAccount, TelegramAccountStatus, User
from app.services.audit import record_audit
from app.services.telegram.client_manager import client_manager
from app.services.telegram.session_manager import session_manager

log = get_logger(__name__)
PENDING_TTL_SECONDS = 600


class TelegramAuthenticationService:
    async def _save_pending(self, auth_id: str, data: dict) -> None:
        blob = encrypt_secret(json.dumps(data)).decode()
        await get_redis().set(pending_auth_key(auth_id), blob, ex=PENDING_TTL_SECONDS)

    async def _load_pending(self, auth_id: str, user: User) -> dict:
        blob = await get_redis().get(pending_auth_key(auth_id))
        if not blob:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "This login attempt has expired. Start again.")
        data = json.loads(decrypt_secret(blob.encode()))
        if data["user_id"] != str(user.id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Login attempt does not belong to this user")
        return data

    async def _clear_pending(self, auth_id: str) -> None:
        await get_redis().delete(pending_auth_key(auth_id))

    async def start(self, user: User, phone_number: str, api_id: int | None, api_hash: str | None) -> tuple[str, str]:
        resolved_id, resolved_hash = client_manager.resolve_api_credentials(None, api_id, api_hash)
        async with client_manager.ephemeral(None, resolved_id, resolved_hash) as client:
            try:
                sent = await client.send_code_request(phone_number)
            except errors.PhoneNumberInvalidError:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Telegram rejected this phone number.")
            except errors.PhoneNumberBannedError:
                raise HTTPException(status.HTTP_403_FORBIDDEN, "Telegram reports this phone number is banned.")
            except errors.FloodWaitError as e:
                raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, f"Telegram asks you to wait {e.seconds} seconds before requesting another code.")
            session_string = client.session.save()
        auth_id = secrets.token_urlsafe(24)
        await self._save_pending(
            auth_id,
            {"user_id": str(user.id), "phone": phone_number, "phone_code_hash": sent.phone_code_hash, "session": session_string, "api_id": resolved_id, "api_hash": resolved_hash},
        )
        via = type(sent.type).__name__.replace("SentCodeType", "").lower() or "telegram"
        return auth_id, via

    async def submit_code(self, db: AsyncSession, user: User, auth_id: str, code: str) -> tuple[str, TelegramAccount | None]:
        data = await self._load_pending(auth_id, user)
        async with client_manager.ephemeral(data["session"], data["api_id"], data["api_hash"]) as client:
            try:
                await client.sign_in(phone=data["phone"], code=code, phone_code_hash=data["phone_code_hash"])
            except errors.SessionPasswordNeededError:
                data["session"] = client.session.save()
                await self._save_pending(auth_id, data)
                return "password_required", None
            except (errors.PhoneCodeInvalidError, errors.PhoneCodeEmptyError):
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "The verification code is incorrect.")
            except errors.PhoneCodeExpiredError:
                await self._clear_pending(auth_id)
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "The verification code has expired. Start again.")
            account = await self._finalize(db, user, client, data)
        await self._clear_pending(auth_id)
        return "authorized", account

    async def submit_password(self, db: AsyncSession, user: User, auth_id: str, password: str) -> tuple[str, TelegramAccount | None]:
        data = await self._load_pending(auth_id, user)
        async with client_manager.ephemeral(data["session"], data["api_id"], data["api_hash"]) as client:
            try:
                await client.sign_in(password=password)
            except errors.PasswordHashInvalidError:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "The two-step verification password is incorrect.")
            account = await self._finalize(db, user, client, data)
        await self._clear_pending(auth_id)
        return "authorized", account

    async def _finalize(self, db: AsyncSession, user: User, client, data: dict) -> TelegramAccount:
        me = await client.get_me()
        session_string: str = client.session.save()
        account = await db.scalar(select(TelegramAccount).where(TelegramAccount.user_id == user.id, TelegramAccount.telegram_user_id == me.id))
        if not account:
            account = TelegramAccount(user_id=user.id, telegram_user_id=me.id)
            db.add(account)
        account.username = me.username
        account.first_name = me.first_name
        account.last_name = me.last_name
        session_manager.store(account, session_string, data["api_id"], data["api_hash"])
        account.last_synced_at = datetime.now(timezone.utc)
        await record_audit(db, action="telegram.connect", user_id=user.id, resource_type="telegram_account", resource_id=str(account.id))
        await db.commit()
        await db.refresh(account)
        log.info("telegram_account_connected", user_id=str(user.id), telegram_user_id=me.id)
        return account

    async def disconnect(self, db: AsyncSession, user: User, account: TelegramAccount, revoke_remote: bool = True) -> None:
        if revoke_remote and account.session_encrypted:
            try:
                async with client_manager.for_account(account) as client:
                    await client.log_out()
            except Exception as exc:  # The local revoke proceeds even if Telegram is unreachable.
                log.warning("telegram_remote_logout_failed", error=type(exc).__name__)
        await session_manager.revoke(db, account)
        await record_audit(db, action="telegram.disconnect", user_id=user.id, resource_type="telegram_account", resource_id=str(account.id))
        await db.commit()

    async def refresh_profile(self, db: AsyncSession, account: TelegramAccount) -> TelegramAccount:
        try:
            async with client_manager.for_account(account) as client:
                me = await client.get_me()
        except HTTPException as exc:
            if exc.status_code == status.HTTP_401_UNAUTHORIZED:
                account.status = TelegramAccountStatus.disconnected
                await db.commit()
            raise
        account.username, account.first_name, account.last_name = me.username, me.first_name, me.last_name
        account.last_synced_at = datetime.now(timezone.utc)
        account.status = TelegramAccountStatus.connected
        await db.commit()
        return account


telegram_auth_service = TelegramAuthenticationService()


def new_auth_id() -> str:
    return str(uuid.uuid4())
