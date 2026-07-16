import asyncio
from datetime import datetime, timezone

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.models.profile import Story
from app.tasks.celery_app import celery_app

settings = get_settings()


async def _cleanup_stories() -> int:
    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        result = await db.execute(
            delete(Story).where(Story.expires_at <= datetime.now(timezone.utc))
        )
        await db.commit()
        count = result.rowcount or 0
    await engine.dispose()
    return count


@celery_app.task(name="app.tasks.maintenance.cleanup_expired_stories")
def cleanup_expired_stories() -> dict:
    deleted = asyncio.run(_cleanup_stories())
    return {"deleted": deleted}


@celery_app.task(name="app.tasks.maintenance.cleanup_expired_messages")
def cleanup_expired_messages() -> dict:
    deleted = asyncio.run(_cleanup_messages())
    return {"deleted": deleted}


@celery_app.task(name="app.tasks.maintenance.send_subscription_reminders")
def send_subscription_reminders() -> dict:
    return asyncio.run(_send_subscription_reminders())


async def _cleanup_messages() -> int:
    from app.models.messaging import Message

    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        result = await db.execute(
            delete(Message).where(Message.auto_delete_at <= datetime.now(timezone.utc))
        )
        await db.commit()
        count = result.rowcount or 0
    await engine.dispose()
    return count


async def _send_subscription_reminders() -> dict:
    from app.services.support_notify_service import run_subscription_reminders

    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        result = await run_subscription_reminders(db)
    await engine.dispose()
    return result
