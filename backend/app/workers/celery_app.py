import redis.connection
import redis.utils
from celery import Celery

from app.core.config import get_settings

# The Windows Redis 5.0 build used in local dev predates RESP3/HELLO (Redis 6.0+), and
# redis-py defaults unset protocol to 3. Celery's kombu transport builds its own redis
# connections with no way to pass protocol=2 through broker_transport_options, so this
# patches the library default before Celery opens any connection. redis.connection
# imported its own name binding (`from .utils import DEFAULT_RESP_VERSION`), so both
# module attributes must be patched — patching redis.utils alone doesn't reach it.
redis.utils.DEFAULT_RESP_VERSION = 2
redis.connection.DEFAULT_RESP_VERSION = 2

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
