from fastapi import APIRouter

from app.api.v1 import admin, auth, groups, health, members, migrations, telegram_accounts, ws

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(telegram_accounts.router)
api_router.include_router(groups.router)
api_router.include_router(members.router)
api_router.include_router(migrations.router)
api_router.include_router(admin.router)
api_router.include_router(ws.router)
