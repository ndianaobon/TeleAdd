import uuid
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import User, UserRole, UserSession

DB = Annotated[AsyncSession, Depends(get_db)]


async def get_current_session(
    db: DB,
    request: Request,
    session_cookie: Annotated[str | None, Cookie(alias=get_settings().cookie_name)] = None,
) -> UserSession:
    token = session_cookie
    if not token:
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")
    try:
        session_id = uuid.UUID(payload["sid"])
    except (KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session")
    session = await db.scalar(select(UserSession).where(UserSession.id == session_id))
    if not session or not session.is_valid:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session revoked or expired")
    return session


async def get_current_user(db: DB, session: Annotated[UserSession, Depends(get_current_session)]) -> User:
    user = await db.get(User, session.user_id)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account disabled")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentSession = Annotated[UserSession, Depends(get_current_session)]


async def require_admin(user: CurrentUser) -> User:
    if user.role != UserRole.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administrator access required")
    return user


AdminUser = Annotated[User, Depends(require_admin)]
