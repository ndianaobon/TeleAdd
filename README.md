# Telegram Member Migrator

A SaaS dashboard for Telegram administrators to move members between communities they are authorized to manage. Connect an owned Telegram account, discover the groups it administers, pick members from a source group, choose a destination, and run a throttled, fully-reported invitation operation.

**Product principle:** this is an administrative tool, not a spam tool. Telegram's answer is authoritative — privacy settings, permissions, and flood limits are respected and recorded, never bypassed. Phone numbers are never collected.

## Architecture

```
React/TS (Vite)  →  FastAPI  →  Redis  →  Celery worker  →  Telethon (MTProto)  →  Telegram
                      ↑           ↓                              ↓
                  WebSocket ← pub/sub                       PostgreSQL
```

| Layer | Stack |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind, react-router, lucide icons |
| Backend | Python 3.12+, FastAPI, SQLAlchemy 2 (async), Alembic, Pydantic v2 |
| Telegram | Telethon (user MTProto session, encrypted at rest with Fernet) |
| Queue / realtime | Redis, Celery, Redis pub/sub → WebSocket |
| Database | PostgreSQL 16 (UUID PKs, BIGINT Telegram ids) |
| Auth | Argon2 password hashing, JWT in HttpOnly cookie, server-side session table with revocation |

## Repository layout

```
frontend/            React application (design from the Figma "Synapse" deck)
backend/
  app/api/v1/        Route handlers only — no Telegram logic
  app/services/      auth, migrations, audit
  app/services/telegram/
    client_manager   builds Telethon clients from encrypted sessions
    auth_service     phone → code → 2FA flow (pending state in Redis, TTL 10 min, encrypted)
    chat_service     dialog discovery + permission detection
    member_service   participant sync (no phone numbers)
    invitation_service  one invite, one Telegram-confirmed outcome
    error_handler    Telethon exception → result code mapping
  app/workers/       Celery app, migration runner, member sync
  app/websocket/     Redis → WebSocket relay
  app/models/        users, telegram_accounts, telegram_chats, telegram_members, migrations,
                     migration_members, audit_logs, subscriptions, usage_records, notifications, system_events
  alembic/           migrations
  tests/             pytest (SQLite in-memory, Telegram fully mocked)
docker-compose.yml   postgres, redis, backend, worker, frontend (nginx)
```

## Local development

### Prerequisites
Node 22+, Python 3.12+, PostgreSQL 16, Redis 7 (or use Docker for the two datastores: `docker compose up postgres redis`).

### 1. Configure
```bash
cp .env.example .env
```
Generate `SECRET_KEY` and `SESSION_ENCRYPTION_KEY` with the commands noted in `.env.example`. Add `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` from https://my.telegram.org (or leave blank and let each user enter their own in Settings → API Configuration).

### 2. Backend
```bash
cd backend
python -m venv .venv && . .venv/Scripts/activate   # Windows; use .venv/bin/activate elsewhere
pip install -r requirements-dev.txt
alembic upgrade head
uvicorn app.main:app --reload
```
OpenAPI docs: http://localhost:8000/api/v1/docs

### 3. Worker
```bash
cd backend
celery -A app.workers.celery_app:celery_app worker --loglevel=INFO --pool=solo
```

### 4. Frontend
```bash
cd frontend
npm install
npm run dev
```
http://localhost:5173 — Vite proxies `/api` to the backend. `frontend/.env.development` sets `VITE_MOCK_AUTH=true` so the UI renders with sample data before the backend is running; set it to `false` to use the real API.

### Tests
```bash
cd backend
pytest
```
Tests never contact Telegram. Scenarios covered: SUCCESS, ALREADY_MEMBER, PRIVACY_RESTRICTED, PERMISSION_DENIED, FLOOD_WAIT, INVALID_USER, FAILED.

## Docker (production-style)
```bash
cp .env.example .env   # fill in real secrets, APP_ENV=production, COOKIE_SECURE=true
docker compose up --build -d
```
Frontend on http://localhost:8080 (nginx proxies `/api` and WebSockets to the backend). Migrations run automatically on backend start. Put a TLS-terminating proxy (Caddy, Traefik, cloud LB) in front for HTTPS.

**Backups:** `docker compose exec postgres pg_dump -U tmm tmm > backup.sql`. Restore with `psql`. Redis holds only queue state and short-lived login attempts; it does not need backing up.

## How an operation runs

1. Wizard: source → destination → members (paginated table, server-side search/filter, "select all" via `/members/ids`) → review.
2. `POST /migrations` snapshots the selected members after applying selection rules (exclude bots/admins/deleted/existing members).
3. `POST /migrations/{id}/start` enqueues a Celery task. The worker opens the account's Telethon session and invites members one at a time with a cooldown.
4. Each Telegram response is classified (`error_handler.py`) and written to `migration_members` with the raw Telegram error name. Newer API layers report privacy-restricted users via `missing_invitees` instead of raising — that path is handled so a user is only marked **success** when Telegram did not reject them.
5. `FloodWaitError` ≤ `MAX_FLOOD_WAIT_SECONDS` sleeps the exact requested time (cancel is still honored); longer waits and `PeerFloodError` pause the operation and mark the account restricted. Permission errors pause too.
6. Progress events publish to Redis; `/ws/migrations/{id}` relays them to the browser.
7. Pause/cancel set a Redis control key that the worker checks between every invite.

## Security notes
- Telegram sessions and API hashes are Fernet-encrypted in the database; the plaintext never leaves `client_manager`/`session_manager`.
- Verification codes and 2FA passwords are forwarded to Telegram and never persisted. Pending login state lives in Redis for 10 minutes, encrypted.
- Structured logs redact `password`, `code`, `session`, `api_hash`, `token` keys and any session-string-shaped values.
- Auth endpoints are rate-limited per IP via Redis. Sessions are revocable server-side; password changes revoke other sessions.
- Admin endpoints never return session material.

## Roadmap / phase status

| Phase | Status |
| --- | --- |
| 1 UI/UX prototype | Done — all Figma screens implemented (light + dark) |
| 2 Database architecture | Done — models, indexes, Alembic |
| 3 Authentication | Done — register/login/logout/me/forgot/reset/verify/change password/sessions |
| 4 Telegram authentication | Done — phone/code/2FA, encrypted sessions, disconnect/revoke |
| 5 Group discovery | Done — dialog sync with admin/invite permission detection |
| 6 Member discovery/selection | Done — background sync, paginated search/filter, eligibility, select-all ids |
| 7 Migration engine | Done — worker with cooldown, flood-wait handling, pause/cancel/resume |
| 8 Real-time progress | Done — Redis pub/sub → WebSocket |
| 9 History/reporting | Done — filters, CSV export, per-member results |
| 10 Security hardening | Baseline done; pending: email delivery for verification/reset, CSP, 2FA for platform login |
| 11 Testing | Auth + Telegram error/invitation tests; pending: worker + WebSocket integration tests |
| 12 Deployment | Docker Compose done; pending: TLS proxy config, CI pipeline |

**Next:** wire the frontend pages to the live API (currently rendering sample data behind `VITE_MOCK_AUTH`), then run the proof-of-concept against consenting test accounts.
