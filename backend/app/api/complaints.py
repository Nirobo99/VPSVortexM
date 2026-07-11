import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.i18n import t
from app.models.user import User
from app.schemas.admin import ComplaintCreateRequest, ComplaintItem
from app.services.admin_panel_service import AdminPanelService

router = APIRouter(tags=["complaints"])


def _lang(request: Request) -> str:
    return request.headers.get("Accept-Language", "ru")[:2]


@router.post("/complaints", response_model=ComplaintItem, status_code=status.HTTP_201_CREATED)
async def create_complaint(
    body: ComplaintCreateRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = AdminPanelService(db)
    try:
        data = await service.create_complaint(user, body.target_type, body.target_id, body.reason)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"admin.{e}", lang))
    return ComplaintItem(**data)
