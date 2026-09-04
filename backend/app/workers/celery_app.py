from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery("tmm", broker=settings.redis_url, backend=settings.redis_url, include=["app.workers.tasks"])
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_track_started=True,
    task_time_limit=60 * 60 * 12,
    worker_max_tasks_per_child=50,
)
