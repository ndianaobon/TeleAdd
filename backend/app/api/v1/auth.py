from fastapi import APIRouter, Request, Response, status
from sqlalchemy import select

from app.core.config import get_settings
from app.core.deps import DB, CurrentSession, CurrentUser
from app.models import UserSession
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    SessionOut,
    UpdateProfileRequest,
    UserOut,
    VerifyEmailRequest,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_cookie(response: Response, token: str) -> None:
    s = get_settings()
    response.set_cookie(
        s.cookie_name,
        token,
        httponly=True,
        secure=s.cookie_secure or s.is_production,
        samesite="lax",
        max_age=s.access_token_ttl_minutes * 60,
        path="/",
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: DB, request: Request):
    user = await auth_service.register_user(db, email=body.email, password=body.password, full_name=body.full_name, request=request)
    return user


@router.post("/login", response_model=UserOut)
async def login(body: LoginRequest, db: DB, request: Request, response: Response):
    user = await auth_service.authenticate(db, email=body.email, password=body.password)
    _, token = await auth_service.create_session(db, user, request)
    _set_cookie(response, token)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(db: DB, session: CurrentSession, response: Response):
    await auth_service.revoke_session(db, session)
    response.delete_cookie(get_settings().cookie_name, path="/")


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser):
    return user


@router.patch("/me", response_model=UserOut)
async def update_me(body: UpdateProfileRequest, db: DB, user: CurrentUser):
    if body.full_name is not None:
        user.full_name = body.full_name.strip()
    await db.commit()
    return user


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(body: ForgotPasswordRequest, db: DB):
    await auth_service.request_password_reset(db, body.email)
    return {"detail": "If an account exists, a reset link has been sent."}


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(body: ResetPasswordRequest, db: DB):
    await auth_service.reset_password(db, body.token, body.password)


@router.post("/verify-email", response_model=UserOut)
async def verify_email(body: VerifyEmailRequest, db: DB):
    return await auth_service.verify_email(db, body.token)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(body: ChangePasswordRequest, db: DB, user: CurrentUser, session: CurrentSession):
    await auth_service.change_password(db, user, body.current_password, body.new_password, keep_session=session.id)


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(db: DB, user: CurrentUser, session: CurrentSession):
    rows = (await db.scalars(select(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None)).order_by(UserSession.created_at.desc()))).all()
    return [SessionOut.model_validate(s).model_copy(update={"current": s.id == session.id}) for s in rows]


@router.post("/sessions/revoke-others", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_other_sessions(db: DB, user: CurrentUser, session: CurrentSession):
    await auth_service.revoke_all_sessions(db, user.id, except_session_id=session.id)
