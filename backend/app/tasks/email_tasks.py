import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.i18n import t
from app.models.user import User
from app.services.email_templates import build_reset_url, build_verification_url
from app.tasks.celery_app import celery_app

settings = get_settings()


def _send_smtp(to: str, subject: str, html: str) -> None:
    if settings.app_env == "development" and not settings.smtp_user:
        print(f"[DEV EMAIL] To: {to}\nSubject: {subject}\n{html}")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg.attach(MIMEText(html, "html", "utf-8"))

    if settings.smtp_use_tls:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port) as server:
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.smtp_from, to, msg.as_string())
    else:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.smtp_from, to, msg.as_string())


async def _get_user_email(user_id: str) -> tuple[str, str]:
    import uuid as uuid_mod
    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        result = await db.execute(select(User).where(User.id == uuid_mod.UUID(user_id)))
        user = result.scalar_one()
        return user.email, user.locale
    await engine.dispose()


@celery_app.task(name="app.tasks.email_tasks.send_verification_email")
def send_verification_email(user_id: str, token: str, locale: str = "ru") -> None:
    email, user_locale = asyncio.run(_get_user_email(user_id))
    lang = locale or user_locale
    url = build_verification_url(token)
    subject = t("email.verification_subject", lang)
    body = t("email.verification_body", lang, url=url)
    _send_smtp(email, subject, f"<p>{body}</p><p><a href='{url}'>{url}</a></p>")


@celery_app.task(name="app.tasks.email_tasks.send_password_reset_email")
def send_password_reset_email(user_id: str, token: str, locale: str = "ru") -> None:
    email, user_locale = asyncio.run(_get_user_email(user_id))
    lang = locale or user_locale
    url = build_reset_url(token)
    subject = t("email.reset_subject", lang)
    body = t("email.reset_body", lang, url=url)
    _send_smtp(email, subject, f"<p>{body}</p><p><a href='{url}'>{url}</a></p>")
