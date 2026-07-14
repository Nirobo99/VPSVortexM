from pydantic import BaseModel, EmailStr, Field, field_validator
import re


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    referral_code: str | None = None
    locale: str = "ru"
    captcha_token: str | None = None

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not re.match(r"^[\w@.\-]+$", v, re.UNICODE):
            raise ValueError("Invalid username format")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    totp_code: str | None = None
    captcha_token: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    csrf_token: str


class RefreshRequest(BaseModel):
    refresh_token: str | None = None


class PasswordResetRequest(BaseModel):
    email: EmailStr
    captcha_token: str | None = None


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class VerifyEmailRequest(BaseModel):
    token: str


class Enable2FARequest(BaseModel):
    totp_code: str


class UserPublic(BaseModel):
    id: str
    username: str
    display_name: str | None
    avatar_url: str | None
    is_verified: bool
    level: int

    model_config = {"from_attributes": True}


class UserMe(BaseModel):
    id: str
    username: str
    email: str
    display_name: str | None
    avatar_url: str | None
    bio: str | None
    profile_visibility: str
    theme_mode: str
    theme_primary: str | None
    theme_accent: str | None
    status_text: str | None
    is_verified: bool
    totp_enabled: bool
    activity_points: int
    level: int
    wallet_balance: int
    locale: str
    role: str
    has_admin_panel: bool = False

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    message: str
    detail: str | None = None
