from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.admin_panel_service import AdminPanelService
from app.schemas.admin import AnnouncementItem

router = APIRouter(tags=["public-pages"])


@router.get("/announcements/active", response_model=list[AnnouncementItem])
async def active_announcements(db: AsyncSession = Depends(get_db)):
    service = AdminPanelService(db)
    return [AnnouncementItem(**a) for a in await service.get_active_announcements()]


@router.get("/pages/{slug}")
async def public_page(slug: str, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select
    from app.models.admin import StaticPage
    result = await db.execute(select(StaticPage).where(StaticPage.slug == slug))
    page = result.scalar_one_or_none()
    if not page:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Page not found")
    return {"slug": page.slug, "title": page.title, "content_html": page.content_html}
