from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.referral import ReferralInfoOut, ReferralListOut, ReferralValidateOut
from app.services.referral_service import ReferralService

router = APIRouter(prefix="/referral", tags=["referral"])


@router.get("/info", response_model=ReferralInfoOut)
async def referral_info(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await ReferralService(db).get_info(user)
    await db.commit()
    return data


@router.get("/list", response_model=ReferralListOut)
async def referral_list(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await ReferralService(db).list_referrals(user, page=page, limit=limit)


@router.get("/validate", response_model=ReferralValidateOut)
async def referral_validate(
    code: str = Query(..., min_length=4, max_length=16),
    db: AsyncSession = Depends(get_db),
):
    return await ReferralService(db).validate_code(code)
