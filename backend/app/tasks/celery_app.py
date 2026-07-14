from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "vortexm",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Moscow",
    enable_utc=True,
    task_track_started=True,
    beat_schedule={
        "cleanup-expired-stories": {
            "task": "app.tasks.maintenance.cleanup_expired_stories",
            "schedule": 3600.0,
        },
        "cleanup-expired-messages": {
            "task": "app.tasks.maintenance.cleanup_expired_messages",
            "schedule": 300.0,
        },
    },
)

celery_app.autodiscover_tasks(["app.tasks"])

import app.tasks.email_tasks  # noqa: F401
import app.tasks.maintenance  # noqa: F401
