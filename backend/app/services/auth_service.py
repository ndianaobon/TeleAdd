import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.security import create_access_token, hash_password, verify_password
from app.core.timeutil import ensure_aware
from app.models import Subscription, User, UserSession, UserToken, UserTokenPurpose
from app.services.audit import record_audit

log = get_logger(__name__)


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


async def register_user(db: AsyncSession, *, email: str, password: str, full_name: str, request: Request | None) -> User:
    email = email.lower().strip()
    existing = await db.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = User(email=email, full_name=full_name.strip(), password_hash=hash_password(password))
    db.add(user)
    await db.flush()
    db.add(Subscription(user_id=user.id))
    await issue_token(db, user, UserTokenPurpose.email_verification, ttl=timedelta(days=2))
    await record_audit(db, action="user.register", user_id=user.id, request=request)
    await db.commit()
    return user


async def authenticate(db: AsyncSession, *, email: str, password: str) -> User:
    user = await db.scalar(select(User).where(User.email == email.lower().strip()))
    # Verify against a dummy hash when the user doesn't exist so timing is uniform.
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been disabled")
    return user


async def create_session(db: AsyncSession, user: User, request: Request | None) -> tuple[UserSession, str]:
    settings = get_settings()
    session = UserSession(
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_ttl_minutes),
        user_agent=request.headers.get("user-agent", "")[:512] if request else None,
        ip_address=request.client.host if request and request.client else None,
    )
    db.add(session)
    user.last_login_at = datetime.now(timezone.utc)
    await db.flush()
    await record_audit(db, action="user.login", user_id=user.id, request=request)
    await db.commit()
    return session, create_access_token(user.id, session.id)


async def revoke_session(db: AsyncSession, session: UserSession) -> None:
    session.revoked_at = datetime.now(timezone.utc)
    await db.commit()


async def revoke_all_sessions(db: AsyncSession, user_id: uuid.UUID, except_session_id: uuid.UUID | None = None) -> int:
    sessions = (await db.scalars(select(UserSession).where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None)))).all()
    count = 0
    for s in sessions:
        if except_session_id and s.id == except_session_id:
            continue
        s.revoked_at = datetime.now(timezone.utc)
        count += 1
    await db.commit()
    return count


async def issue_token(db: AsyncSession, user: User, purpose: UserTokenPurpose, ttl: timedelta) -> str:
    raw = secrets.token_urlsafe(32)
    db.add(UserToken(user_id=user.id, purpose=purpose, token_hash=_hash_token(raw), expires_at=datetime.now(timezone.utc) + ttl))
    await db.flush()
    # Email delivery is wired in a later phase; the token is logged only at DEBUG in development.
    if not get_settings().is_production:
        log.debug("token_issued", purpose=purpose.value, user_id=str(user.id), token_preview=raw[:6] + "…")
    return raw


async def consume_token(db: AsyncSession, raw: str, purpose: UserTokenPurpose) -> User:
    token = await db.scalar(select(UserToken).where(UserToken.token_hash == _hash_token(raw), UserToken.purpose == purpose))
    if not token or token.used_at or ensure_aware(token.expires_at) < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This link is invalid or has expired")
    token.used_at = datetime.now(timezone.utc)
    user = await db.get(User, token.user_id)
    if not user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Account not found")
    return user


async def request_password_reset(db: AsyncSession, email: str) -> None:
    user = await db.scalar(select(User).where(User.email == email.lower().strip()))
    if user:
        await issue_token(db, user, UserTokenPurpose.password_reset, ttl=timedelta(hours=1))
        await db.commit()


async def reset_password(db: AsyncSession, raw_token: str, new_password: str) -> None:
    user = await consume_token(db, raw_token, UserTokenPurpose.password_reset)
    user.password_hash = hash_password(new_password)
    await revoke_all_sessions(db, user.id)
    await record_audit(db, action="user.password_reset", user_id=user.id)
    await db.commit()


async def verify_email(db: AsyncSession, raw_token: str) -> User:
    user = await consume_token(db, raw_token, UserTokenPurpose.email_verification)
    user.is_verified = True
    user.email_verified_at = datetime.now(timezone.utc)
    await db.commit()
    return user


async def change_password(db: AsyncSession, user: User, current: str, new: str, keep_session: uuid.UUID) -> None:
    if not verify_password(current, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    user.password_hash = hash_password(new)
    await revoke_all_sessions(db, user.id, except_session_id=keep_session)
    await record_audit(db, action="user.password_change", user_id=user.id)
    await db.commit()
