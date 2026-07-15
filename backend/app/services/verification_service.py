import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile import (
    VerificationApplicantType,
    VerificationRequest,
    VerificationRequestStatus,
)
from app.models.user import User


class VerificationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def request_to_dict(req: VerificationRequest, username: str | None = None) -> dict:
        return {
            "id": str(req.id),
            "user_id": str(req.user_id),
            "username": username,
            "applicant_type": req.applicant_type.value,
            "first_name": req.first_name,
            "last_name": req.last_name,
            "patronymic": req.patronymic,
            "birth_date": req.birth_date.isoformat() if req.birth_date else None,
            "legal_entity_name": req.legal_entity_name,
            "legal_inn": req.legal_inn,
            "legal_ogrn": req.legal_ogrn,
            "legal_address": req.legal_address,
            "reason": req.reason,
            "link_vk_group": req.link_vk_group,
            "link_vk_page": req.link_vk_page,
            "link_instagram": req.link_instagram,
            "link_telegram": req.link_telegram,
            "status": req.status.value,
            "admin_note": req.admin_note,
            "reviewed_at": req.reviewed_at.isoformat() if req.reviewed_at else None,
            "created_at": req.created_at.isoformat() if req.created_at else None,
        }

    async def get_latest_for_user(self, user_id: uuid.UUID) -> VerificationRequest | None:
        result = await self.db.execute(
            select(VerificationRequest)
            .where(VerificationRequest.user_id == user_id)
            .order_by(VerificationRequest.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def submit(self, user: User, data: dict) -> VerificationRequest:
        if user.is_official_verified:
            raise ValueError("already_verified")

        pending = await self.db.execute(
            select(VerificationRequest).where(
                VerificationRequest.user_id == user.id,
                VerificationRequest.status == VerificationRequestStatus.PENDING,
            )
        )
        if pending.scalar_one_or_none():
            raise ValueError("request_pending")

        applicant_type = VerificationApplicantType(data["applicant_type"])
        if applicant_type == VerificationApplicantType.INDIVIDUAL:
            if not data.get("first_name") or not data.get("last_name") or not data.get("birth_date"):
                raise ValueError("individual_fields_required")
        else:
            if not data.get("legal_entity_name") or not data.get("legal_inn"):
                raise ValueError("organization_fields_required")

        reason = (data.get("reason") or "").strip()
        if len(reason) < 20:
            raise ValueError("reason_too_short")

        links = [
            data.get("link_vk_group"),
            data.get("link_vk_page"),
            data.get("link_instagram"),
            data.get("link_telegram"),
        ]
        if not any(link and str(link).strip() for link in links):
            raise ValueError("link_required")

        birth_date = data.get("birth_date")
        if isinstance(birth_date, str) and birth_date:
            birth_date = datetime.fromisoformat(birth_date.replace("Z", "+00:00"))
        elif not birth_date:
            birth_date = None

        req = VerificationRequest(
            user_id=user.id,
            applicant_type=applicant_type,
            first_name=data.get("first_name"),
            last_name=data.get("last_name"),
            patronymic=data.get("patronymic"),
            birth_date=birth_date,
            legal_entity_name=data.get("legal_entity_name"),
            legal_inn=data.get("legal_inn"),
            legal_ogrn=data.get("legal_ogrn"),
            legal_address=data.get("legal_address"),
            reason=reason,
            link_vk_group=data.get("link_vk_group"),
            link_vk_page=data.get("link_vk_page"),
            link_instagram=data.get("link_instagram"),
            link_telegram=data.get("link_telegram"),
            status=VerificationRequestStatus.PENDING,
        )
        self.db.add(req)
        await self.db.commit()
        await self.db.refresh(req)
        return req

    async def list_requests(self, status: str | None = None) -> list[dict]:
        query = (
            select(VerificationRequest, User.username)
            .join(User, User.id == VerificationRequest.user_id)
            .order_by(VerificationRequest.created_at.desc())
        )
        if status:
            query = query.where(VerificationRequest.status == VerificationRequestStatus(status))
        result = await self.db.execute(query.limit(100))
        return [
            self.request_to_dict(req, username=username)
            for req, username in result.all()
        ]

    async def review(
        self,
        admin: User,
        request_id: uuid.UUID,
        approve: bool,
        admin_note: str | None = None,
    ) -> dict:
        result = await self.db.execute(
            select(VerificationRequest, User)
            .join(User, User.id == VerificationRequest.user_id)
            .where(VerificationRequest.id == request_id)
        )
        row = result.one_or_none()
        if not row:
            raise ValueError("request_not_found")
        req, target_user = row

        if req.status != VerificationRequestStatus.PENDING:
            raise ValueError("request_already_reviewed")

        req.status = VerificationRequestStatus.APPROVED if approve else VerificationRequestStatus.REJECTED
        req.admin_note = admin_note
        req.reviewed_by_id = admin.id
        req.reviewed_at = datetime.now(timezone.utc)

        if approve:
            target_user.is_official_verified = True

        await self.db.commit()
        await self.db.refresh(req)
        return self.request_to_dict(req, username=target_user.username)
