import json
import uuid

from fastapi import APIRouter, WebSocket, status
from sqlalchemy import select

from app.core.config import get_settings
from app.core.redis import migration_events_channel
from app.core.security import decode_access_token
from app.db.session import SessionLocal
from app.models import Migration, TelegramAccount, TelegramChat, UserSession
from app.websocket.manager import relay_channel

router = APIRouter(tags=["websocket"])


async def _authenticate(websocket: WebSocket) -> uuid.UUID | None:
    token = websocket.cookies.get(get_settings().cookie_name) or websocket.query_params.get("token")
    payload = decode_access_token(token) if token else None
    if not payload:
        return None
    async with SessionLocal() as db:
        session = await db.get(UserSession, uuid.UUID(payload["sid"]))
        if not session or not session.is_valid:
            return None
        return session.user_id


@router.websocket("/ws/migrations/{migration_id}")
async def migration_events(websocket: WebSocket, migration_id: uuid.UUID):
    user_id = await _authenticate(websocket)
    if not user_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    async with SessionLocal() as db:
        m = await db.scalar(select(Migration).where(Migration.id == migration_id, Migration.user_id == user_id))
        if not m:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        snapshot = {
            "type": "snapshot",
            "status": m.status.value,
            "counters": {k: getattr(m, k) for k in ("total_selected", "processed", "successful", "already_member", "privacy_restricted", "failed", "skipped")},
            "last_error": m.last_error,
        }
    await websocket.accept()
    await websocket.send_text(json.dumps(snapshot))
    await relay_channel(websocket, migration_events_channel(str(migration_id)))


@router.websocket("/ws/groups/{chat_id}/sync")
async def member_sync_events(websocket: WebSocket, chat_id: uuid.UUID):
    user_id = await _authenticate(websocket)
    if not user_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    async with SessionLocal() as db:
        chat = await db.scalar(select(TelegramChat).join(TelegramAccount).where(TelegramChat.id == chat_id, TelegramAccount.user_id == user_id))
        if not chat:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    await websocket.accept()
    await relay_channel(websocket, f"chat:{chat_id}:sync")
