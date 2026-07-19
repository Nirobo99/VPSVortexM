from datetime import datetime
from pydantic import BaseModel, Field


class ReferralValidateOut(BaseModel):
    valid: bool
    referrer_username: str | None = None


class ReferralInfoOut(BaseModel):
    referral_code: str
    referral_link: str
    referral_count: int
    purchased_count: int
    total_bonus_earned: int


class ReferralListItem(BaseModel):
    username: str
    avatar_url: str | None = None
    registered_at: datetime | None = None
    has_purchased: bool
    first_purchase_at: datetime | None = None
    bonus_earned: int = 0


class ReferralListOut(BaseModel):
    items: list[ReferralListItem]
    total: int
    page: int
    limit: int = Field(ge=1, le=100)
    has_more: bool
