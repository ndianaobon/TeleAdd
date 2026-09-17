import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.core.deps import DB, CurrentUser
from app.core.ratelimit import rate_limit
from app.models import TelegramAccount
from app.schemas.telegram import (
    ResendTelegramCodeRequest,
    StartTelegramAuthRequest,
    StartTelegramAuthResponse,
    SubmitTelegramCodeRequest,
    SubmitTelegramPasswordRequest,
    TelegramAccountOut,
    TelegramAuthStepResponse,
)
from app.services.telegram.auth_service import telegram_auth_service

router = APIRouter(prefix="/telegram-accounts", tags=["telegram-accounts"])


async def _owned(db, user, account_id: uuid.UUID) -> TelegramAccount:
    acc = await db.scalar(select(TelegramAccount).where(TelegramAccount.id == account_id, TelegramAccount.user_id == user.id))
    if not acc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Telegram account not found")
    return acc


@router.get("", response_model=list[TelegramAccountOut])
async def list_accounts(db: DB, user: CurrentUser):
    return (await db.scalars(select(TelegramAccount).where(TelegramAccount.user_id == user.id).order_by(TelegramAccount.created_at))).all()


@router.post("/auth/start", response_model=StartTelegramAuthResponse, dependencies=[Depends(rate_limit("tg_auth_start", 5, 600))])
async def auth_start(body: StartTelegramAuthRequest, user: CurrentUser):
    auth_id, via = await telegram_auth_service.start(user, body.phone_number, body.api_id, body.api_hash)
    return StartTelegramAuthResponse(auth_id=auth_id, code_sent_via=via)


@router.post("/auth/resend", response_model=StartTelegramAuthResponse, dependencies=[Depends(rate_limit("tg_auth_resend", 5, 600))])
async def auth_resend(body: ResendTelegramCodeRequest, user: CurrentUser):
    via = await telegram_auth_service.resend(user, body.auth_id)
    return StartTelegramAuthResponse(auth_id=body.auth_id, code_sent_via=via)


@router.post("/auth/code", response_model=TelegramAuthStepResponse, dependencies=[Depends(rate_limit("tg_auth_code", 10, 600))])
async def auth_code(body: SubmitTelegramCodeRequest, db: DB, user: CurrentUser):
    step, account = await telegram_auth_service.submit_code(db, user, body.auth_id, body.code)
    return TelegramAuthStepResponse(status=step, account=account)


@router.post("/auth/password", response_model=TelegramAuthStepResponse, dependencies=[Depends(rate_limit("tg_auth_pw", 10, 600))])
async def auth_password(body: SubmitTelegramPasswordRequest, db: DB, user: CurrentUser):
    step, account = await telegram_auth_service.submit_password(db, user, body.auth_id, body.password)
    return TelegramAuthStepResponse(status=step, account=account)


@router.post("/{account_id}/sync", response_model=TelegramAccountOut)
async def sync_account(account_id: uuid.UUID, db: DB, user: CurrentUser):
    account = await _owned(db, user, account_id)
    return await telegram_auth_service.refresh_profile(db, account)


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_account(account_id: uuid.UUID, db: DB, user: CurrentUser):
    account = await _owned(db, user, account_id)
    await telegram_auth_service.disconnect(db, user, account)


@router.delete("/{account_id}/purge", status_code=status.HTTP_204_NO_CONTENT)
async def purge_account(account_id: uuid.UUID, db: DB, user: CurrentUser):
    """Disconnects and deletes the account record along with its discovered groups and members."""
    account = await _owned(db, user, account_id)
    await telegram_auth_service.disconnect(db, user, account)
    await db.delete(account)
    await db.commit()
