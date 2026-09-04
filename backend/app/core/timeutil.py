from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_aware(dt: datetime) -> datetime:
    # SQLite (used in tests) drops tzinfo on DateTime(timezone=True) columns.
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)
