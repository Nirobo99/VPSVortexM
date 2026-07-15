import io
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import qrcode
import qrcode.image.svg
from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.i18n import t
from app.core.security import hash_password
from app.models.profile import ProfilePost, ProfilePostMediaType, Story, StoryMediaType
from app.models.social import BlockedUser
from app.models.user import ProfileVisibility, ThemeMode, User, UserRole
from app.services.gamification_service import GamificationService
from app.services.storage_service import StorageService

settings = get_settings()


class ProfileService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.gamification = GamificationService(db)

    async def update_profile(
        self,
        user: User,
        display_name: str | None = None,
        bio: str | None = None,
        birth_date: datetime | None = None,
        profile_visibility: ProfileVisibility | None = None,
        locale: str | None = None,
    ) -> User:
        if display_name is not None:
            user.display_name = display_name
        if bio is not None:
            user.bio = bio
        if birth_date is not None:
            user.birth_date = birth_date
        if profile_visibility is not None:
            user.profile_visibility = profile_visibility
        if locale is not None:
            user.locale = locale
        await self.gamification.add_points(user, "profile_update")
        return user

    async def update_theme(
        self,
        user: User,
        theme_mode: ThemeMode | None = None,
        theme_primary: str | None = None,
        theme_accent: str | None = None,
    ) -> User:
        if theme_mode is not None:
            user.theme_mode = theme_mode
        if theme_primary is not None:
            user.theme_primary = theme_primary
        if theme_accent is not None:
            user.theme_accent = theme_accent
        await self.db.commit()
        return user

    async def update_status(self, user: User, status_text: str | None, status_emoji: str | None) -> User:
        user.status_text = status_text
        user.status_emoji = status_emoji
        await self.gamification.add_points(user, "status_update")
        return user

    async def upload_avatar(self, user: User, content: bytes, content_type: str) -> User:
        if user.avatar_url:
            StorageService.delete_by_url(user.avatar_url)
        user.avatar_url = StorageService.upload_avatar(user.id, content, content_type)
        await self.gamification.add_points(user, "avatar_upload")
        return user

    async def change_username(self, user: User, new_username: str) -> User:
        now = datetime.now(timezone.utc)
        if user.username_changed_at and (now - user.username_changed_at).days < 30:
            raise ValueError("username_change_cooldown")
        existing = await self.db.execute(select(User).where(User.username == new_username))
        if existing.scalar_one_or_none():
            raise ValueError("user_exists")
        user.username = new_username
        user.username_changed_at = now
        await self.db.commit()
        return user

    async def update_invisible_settings(self, user: User, fake_last_seen: datetime | None) -> User:
        user.invisible_fake_last_seen = fake_last_seen
        await self.db.commit()
        return user

    def generate_qr_svg(self, user: User) -> str:
        base = settings.allowed_origins.split(",")[0].strip()
        link = f"{base}/contacts/add?user={user.username}"
        factory = qrcode.image.svg.SvgPathImage
        qr = qrcode.QRCode(version=1, box_size=8, border=2, image_factory=factory)
        qr.add_data(link)
        qr.make(fit=True)
        img = qr.make_image()
        buf = io.BytesIO()
        img.save(buf)
        return buf.getvalue().decode("utf-8")

    async def get_public_profile(self, username: str, viewer: User | None) -> dict:
        result = await self.db.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        if not user:
            raise ValueError("user_not_found")

        if viewer and await self._is_blocked(user.id, viewer.id):
            raise ValueError("user_blocked")

        is_owner = viewer and viewer.id == user.id
        if user.profile_visibility == ProfileVisibility.PRIVATE and not is_owner:
            raise ValueError("profile_private")

        show_email = is_owner
        data = {
            "id": str(user.id),
            "username": user.username,
            "display_name": user.display_name,
            "avatar_url": StorageService.generate_presigned_url(user.avatar_url),
            "bio": user.bio if is_owner or user.profile_visibility == ProfileVisibility.PUBLIC else None,
            "status_text": user.status_text,
            "status_emoji": user.status_emoji,
            "is_verified": user.is_verified,
            "is_admin": user.role in (UserRole.ADMIN, UserRole.SUPERADMIN),
            "is_anonymous": user.is_anonymous,
            "profile_visibility": user.profile_visibility.value,
        }
        if show_email:
            data["email"] = user.email
            data["birth_date"] = user.birth_date.isoformat() if user.birth_date else None
        return data

    async def block_user(self, user: User, blocked_user_id: uuid.UUID) -> None:
        if user.id == blocked_user_id:
            raise ValueError("cannot_block_self")
        target = await self.db.execute(select(User).where(User.id == blocked_user_id))
        if not target.scalar_one_or_none():
            raise ValueError("user_not_found")
        existing = await self.db.execute(
            select(BlockedUser).where(
                BlockedUser.user_id == user.id,
                BlockedUser.blocked_user_id == blocked_user_id,
            )
        )
        if existing.scalar_one_or_none():
            return
        self.db.add(BlockedUser(user_id=user.id, blocked_user_id=blocked_user_id))
        await self.db.commit()

    async def unblock_user(self, user: User, blocked_user_id: uuid.UUID) -> None:
        await self.db.execute(
            delete(BlockedUser).where(
                BlockedUser.user_id == user.id,
                BlockedUser.blocked_user_id == blocked_user_id,
            )
        )
        await self.db.commit()

    async def list_blocked_users(self, user: User) -> list[dict]:
        result = await self.db.execute(
            select(User, BlockedUser)
            .join(BlockedUser, BlockedUser.blocked_user_id == User.id)
            .where(BlockedUser.user_id == user.id)
        )
        return [
            {
                "id": str(u.id),
                "username": u.username,
                "display_name": u.display_name,
                "avatar_url": StorageService.generate_presigned_url(u.avatar_url),
                "blocked_at": b.created_at.isoformat(),
            }
            for u, b in result.all()
        ]

    async def create_story(
        self,
        user: User,
        text: str | None,
        content: bytes | None,
        content_type: str | None,
    ) -> Story:
        media_url = None
        media_type = StoryMediaType.TEXT
        if content and content_type:
            url, mt = StorageService.upload_story_media(user.id, content, content_type)
            media_url = url
            media_type = StoryMediaType.IMAGE if mt == "image" else StoryMediaType.VIDEO

        story = Story(
            user_id=user.id,
            media_url=media_url,
            media_type=media_type,
            text=text,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
        )
        self.db.add(story)
        await self.db.flush()
        await self.gamification.add_points(user, "story_post")
        return story

    async def get_user_stories(self, user_id: uuid.UUID, active_only: bool = True) -> list[Story]:
        query = select(Story).where(Story.user_id == user_id).order_by(Story.created_at.desc())
        if active_only:
            query = query.where(Story.expires_at > datetime.now(timezone.utc))
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def delete_story(self, user: User, story_id: uuid.UUID) -> None:
        result = await self.db.execute(
            select(Story).where(Story.id == story_id, Story.user_id == user.id)
        )
        story = result.scalar_one_or_none()
        if not story:
            raise ValueError("story_not_found")
        if story.media_url:
            StorageService.delete_by_url(story.media_url)
        await self.db.delete(story)
        await self.db.commit()

    async def create_profile_post(
        self,
        user: User,
        text: str | None,
        content: bytes | None,
        content_type: str | None,
    ) -> ProfilePost:
        media_url = None
        media_type = ProfilePostMediaType.TEXT
        if content and content_type:
            media_url = StorageService.upload_profile_post_media(user.id, content, content_type)
            media_type = ProfilePostMediaType.IMAGE
        if not (text and text.strip()) and not media_url:
            raise ValueError("empty_post")
        post = ProfilePost(
            user_id=user.id,
            media_url=media_url,
            media_type=media_type,
            text=text.strip() if text else None,
        )
        self.db.add(post)
        await self.db.flush()
        await self.gamification.add_points(user, "story_post")
        return post

    async def get_user_posts(self, user_id: uuid.UUID) -> list[ProfilePost]:
        result = await self.db.execute(
            select(ProfilePost)
            .where(ProfilePost.user_id == user_id)
            .order_by(ProfilePost.created_at.desc())
        )
        return list(result.scalars().all())

    async def delete_profile_post(self, user: User, post_id: uuid.UUID) -> None:
        result = await self.db.execute(
            select(ProfilePost).where(ProfilePost.id == post_id, ProfilePost.user_id == user.id)
        )
        post = result.scalar_one_or_none()
        if not post:
            raise ValueError("post_not_found")
        if post.media_url:
            StorageService.delete_by_url(post.media_url)
        await self.db.delete(post)
        await self.db.commit()

    async def _is_blocked(self, user_a: uuid.UUID, user_b: uuid.UUID) -> bool:
        result = await self.db.execute(
            select(BlockedUser).where(
                ((BlockedUser.user_id == user_a) & (BlockedUser.blocked_user_id == user_b))
                | ((BlockedUser.user_id == user_b) & (BlockedUser.blocked_user_id == user_a))
            )
        )
        return result.scalar_one_or_none() is not None

    @staticmethod
    async def create_anonymous_user(
        db: AsyncSession,
        username: str,
        display_name: str,
        mask_face: bool = True,
        mask_voice: bool = True,
    ) -> User:
        existing = await db.execute(select(User).where(User.username == username))
        if existing.scalar_one_or_none():
            raise ValueError("user_exists")

        password = secrets.token_urlsafe(16)
        user = User(
            username=username,
            email=f"{username}@anonymous.vortexm",
            password_hash=hash_password(password),
            display_name=display_name,
            is_active=True,
            is_verified=True,
            is_anonymous=True,
            anonymous_mask_face=mask_face,
            anonymous_mask_voice=mask_voice,
            profile_visibility=ProfileVisibility.PRIVATE,
            referral_code=secrets.token_urlsafe(8)[:12],
        )
        db.add(user)
        await db.commit()
        return user

    @staticmethod
    def user_to_dict(user: User, full: bool = False) -> dict:
        data = {
            "id": str(user.id),
            "username": user.username,
            "display_name": user.display_name,
            "avatar_url": StorageService.generate_presigned_url(user.avatar_url),
            "bio": user.bio,
            "birth_date": user.birth_date.isoformat() if user.birth_date else None,
            "profile_visibility": user.profile_visibility.value,
            "theme_mode": user.theme_mode.value,
            "theme_primary": user.theme_primary,
            "theme_accent": user.theme_accent,
            "status_text": user.status_text,
            "status_emoji": user.status_emoji,
            "is_verified": user.is_verified,
            "is_anonymous": user.is_anonymous,
            "anonymous_mask_face": user.anonymous_mask_face,
            "anonymous_mask_voice": user.anonymous_mask_voice,
            "activity_points": user.activity_points,
            "level": user.level,
            "locale": user.locale,
            "role": user.role.value,
        }
        if full:
            data["email"] = user.email
            data["invisible_until"] = user.invisible_until.isoformat() if user.invisible_until else None
            data["invisible_fake_last_seen"] = (
                user.invisible_fake_last_seen.isoformat() if user.invisible_fake_last_seen else None
            )
        return data
