import os
from celery import Celery
from celery.schedules import crontab

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "brain_tasks",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "check-expirations-daily": {
            "task": "main.check_expirations_and_notify_task",
            "schedule": crontab(hour=8, minute=0),
        },
        "check-reminders": {
            "task": "main.check_due_reminders_task",
            "schedule": crontab(minute="*/5"),
        },
        "daily-backup": {
            "task": "main.run_scheduled_backup_task",
            "schedule": crontab(hour=2, minute=0),
        },
    }
)
