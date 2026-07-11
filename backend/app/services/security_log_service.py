from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.security import SecurityLog


class SecurityLogService:
    @staticmethod
    async def log(
        db: AsyncSession,
        event_type: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
        actor_user_id: uuid.UUID | None = None,
        target_type: str | None = None,
        target_id: str | None = None,
        description: str | None = None,
        details: dict | None = None,
    ) -> None:
        db.add(
            SecurityLog(
                event_type=event_type,
                actor_user_id=actor_user_id,
                target_type=target_type,
                target_id=target_id,
                ip_address=ip_address,
                user_agent=user_agent,
                details=details,
                description=description,
            )
        )
