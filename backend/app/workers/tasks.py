import asyncio

from app.workers.celery_app import celery_app


@celery_app.task(name="migration.run", bind=True)
def run_migration(self, migration_id: str) -> dict:
    from app.workers.migration_runner import MigrationRunner

    return asyncio.run(MigrationRunner(migration_id).run())


@celery_app.task(name="members.sync")
def sync_members(account_id: str, chat_id: str) -> dict:
    from app.workers.member_sync import sync_chat_members

    return asyncio.run(sync_chat_members(account_id, chat_id))
