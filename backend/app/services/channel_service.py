import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.channels import (
    EXTENDED_MEMBER_LIMIT,
    Channel,
    ChannelBroadcast,
    ChannelMember,
    ChannelMemberRole,
    ChannelPost,
    ChannelProduct,
    ChannelVerificationRequest,
    ChannelVerificationRequestStatus,
    ChannelVisibility,
    PollOption,
    PollVote,
    PostComment,
    PostEvent,
    PostPurchase,
    PostReaction,
    PostType,
)
from app.models.user import User
from app.services.storage_service import StorageService
from app.services.ws_manager import ws_manager

GROUP_EXTENSION_PRICE = 500
SUBSCRIPTION_SHARE_PERCENT = 0


def _slugify(text: str) -> str:
    s = re.sub(r"[^\w\s-]", "", text.lower().strip())
    s = re.sub(r"[\s_]+", "-", s)
    return s[:64] or "channel"


_FAKE_BADGE_CHARS = re.compile(r"[✓✔✅☑🟊★✪]")


def _clean_channel_title(title: str) -> str:
    """Remove fake verification glyphs; real badge comes only from is_verified."""
    cleaned = _FAKE_BADGE_CHARS.sub("", title or "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


class ChannelService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_member(self, channel_id: uuid.UUID, user_id: uuid.UUID) -> ChannelMember | None:
        result = await self.db.execute(
            select(ChannelMember).where(ChannelMember.channel_id == channel_id, ChannelMember.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def _require_member(self, channel_id: uuid.UUID, user_id: uuid.UUID) -> ChannelMember:
        m = await self._get_member(channel_id, user_id)
        if not m:
            raise ValueError("not_member")
        return m

    def _admin_permissions(self) -> dict:
        return {
            "can_post": True,
            "can_edit": True,
            "can_delete": True,
            "can_ban": True,
            "can_pin": True,
            "can_announce": True,
            "can_manage_members": True,
        }

    async def create_channel(
        self,
        user: User,
        title: str,
        description: str | None,
        visibility: ChannelVisibility,
        subscription_price: int = 0,
    ) -> Channel:
        base_slug = _slugify(title)
        slug = base_slug
        n = 1
        while True:
            exists = await self.db.execute(select(Channel).where(Channel.slug == slug))
            if not exists.scalar_one_or_none():
                break
            slug = f"{base_slug}-{n}"
            n += 1

        cleaned_title = _clean_channel_title(title)
        if not cleaned_title:
            raise ValueError("invalid_title")

        channel = Channel(
            title=cleaned_title,
            slug=slug,
            description=description,
            owner_id=user.id,
            visibility=visibility,
            subscription_price=subscription_price,
            subscriber_count=1,
            is_verified=False,
        )
        self.db.add(channel)
        await self.db.flush()

        member = ChannelMember(
            channel_id=channel.id,
            user_id=user.id,
            role=ChannelMemberRole.OWNER,
            **self._admin_permissions(),
        )
        self.db.add(member)
        await self.db.commit()
        await self.db.refresh(channel)
        return channel

    async def list_channels(self, user: User | None, query: str | None = None) -> list[dict]:
        q = select(Channel)
        if query:
            q = q.where(or_(Channel.title.ilike(f"%{query}%"), Channel.slug.ilike(f"%{query}%")))
        if user is None:
            q = q.where(Channel.visibility == ChannelVisibility.PUBLIC)
        result = await self.db.execute(q.order_by(Channel.subscriber_count.desc()).limit(50))
        channels = result.scalars().all()
        out = []
        for ch in channels:
            is_member = False
            member = None
            if user:
                member = await self._get_member(ch.id, user.id)
                is_member = member is not None
            if ch.visibility == ChannelVisibility.CLOSED and not is_member:
                continue
            is_owner = bool(user and ch.owner_id == user.id)
            out.append(self._channel_dict(ch, is_member, is_owner, member))
        return out

    def _channel_dict(
        self,
        ch: Channel,
        is_member: bool = False,
        is_owner: bool = False,
        member: ChannelMember | None = None,
    ) -> dict:
        my_role = member.role.value if member else None
        can_post = bool(
            is_owner
            or (
                member
                and (
                    member.role in (ChannelMemberRole.OWNER, ChannelMemberRole.ADMIN)
                    or member.can_post
                )
            )
        )
        can_manage_members = bool(
            is_owner
            or (
                member
                and (
                    member.role == ChannelMemberRole.OWNER
                    or member.can_manage_members
                )
            )
        )
        return {
            "id": str(ch.id),
            "slug": ch.slug,
            "title": ch.title,
            "description": ch.description,
            "avatar_url": StorageService.generate_presigned_url(ch.avatar_url),
            "owner_id": str(ch.owner_id),
            "visibility": ch.visibility.value,
            "is_verified": ch.is_verified,
            "subscriber_count": ch.subscriber_count,
            "subscription_price": ch.subscription_price,
            "is_member": is_member,
            "is_owner": is_owner or False,
            "my_role": my_role,
            "can_post": can_post,
            "can_manage_members": can_manage_members,
            "created_at": ch.created_at.isoformat(),
        }

    async def get_channel(self, slug: str, user: User | None) -> dict:
        result = await self.db.execute(select(Channel).where(Channel.slug == slug))
        ch = result.scalar_one_or_none()
        if not ch:
            raise ValueError("channel_not_found")
        member = None
        is_member = False
        is_owner = False
        if user:
            member = await self._get_member(ch.id, user.id)
            is_member = member is not None
            is_owner = ch.owner_id == user.id
        if ch.visibility == ChannelVisibility.CLOSED and not is_member:
            raise ValueError("channel_private")
        return self._channel_dict(ch, is_member, is_owner, member)

    async def update_channel(
        self,
        user: User,
        slug: str,
        title: str | None = None,
        description: str | None = None,
        visibility: ChannelVisibility | None = None,
        subscription_price: int | None = None,
    ) -> dict:
        result = await self.db.execute(select(Channel).where(Channel.slug == slug))
        ch = result.scalar_one_or_none()
        if not ch:
            raise ValueError("channel_not_found")
        member = await self._get_member(ch.id, user.id)
        if ch.owner_id != user.id and (not member or member.role not in (ChannelMemberRole.OWNER, ChannelMemberRole.ADMIN)):
            raise ValueError("no_permission")
        if title is not None:
            cleaned = _clean_channel_title(title)
            if not cleaned:
                raise ValueError("invalid_title")
            ch.title = cleaned
        if description is not None:
            ch.description = description.strip() or None
        if visibility is not None:
            ch.visibility = visibility
        if subscription_price is not None:
            if subscription_price < 0:
                raise ValueError("invalid_price")
            ch.subscription_price = subscription_price
        await self.db.commit()
        await self.db.refresh(ch)
        member = await self._get_member(ch.id, user.id)
        return self._channel_dict(ch, True, ch.owner_id == user.id, member)

    async def upload_avatar(self, user: User, slug: str, content: bytes, content_type: str) -> dict:
        result = await self.db.execute(select(Channel).where(Channel.slug == slug))
        ch = result.scalar_one_or_none()
        if not ch:
            raise ValueError("channel_not_found")
        member = await self._get_member(ch.id, user.id)
        if ch.owner_id != user.id and (
            not member or member.role not in (ChannelMemberRole.OWNER, ChannelMemberRole.ADMIN)
        ):
            raise ValueError("no_permission")
        if ch.avatar_url:
            StorageService.delete_by_url(ch.avatar_url)
        ch.avatar_url = StorageService.upload_channel_avatar(ch.id, content, content_type)
        await self.db.commit()
        await self.db.refresh(ch)
        member = await self._get_member(ch.id, user.id)
        return self._channel_dict(ch, True, ch.owner_id == user.id, member)

    async def join_channel(self, user: User, slug: str) -> dict:
        result = await self.db.execute(select(Channel).where(Channel.slug == slug))
        ch = result.scalar_one_or_none()
        if not ch:
            raise ValueError("channel_not_found")
        if await self._get_member(ch.id, user.id):
            raise ValueError("already_member")
        if ch.visibility == ChannelVisibility.CLOSED:
            raise ValueError("channel_private")

        paid = False
        if ch.subscription_price > 0:
            vmoney = int(getattr(user, "vmoney_balance", 0) or 0)
            if vmoney < ch.subscription_price:
                raise ValueError("insufficient_balance")
            user.vmoney_balance = vmoney - ch.subscription_price
            owner = await self.db.get(User, ch.owner_id)
            if owner:
                owner.vmoney_balance = int(getattr(owner, "vmoney_balance", 0) or 0) + ch.subscription_price
            paid = True

        self.db.add(
            ChannelMember(
                channel_id=ch.id,
                user_id=user.id,
                role=ChannelMemberRole.SUBSCRIBER,
                is_subscriber_paid=paid,
            )
        )
        ch.subscriber_count += 1
        await self.db.commit()
        member = await self._get_member(ch.id, user.id)
        return self._channel_dict(ch, True, False, member)

    async def leave_channel(self, user: User, slug: str) -> None:
        result = await self.db.execute(select(Channel).where(Channel.slug == slug))
        ch = result.scalar_one_or_none()
        if not ch:
            raise ValueError("channel_not_found")
        member = await self._get_member(ch.id, user.id)
        if not member:
            raise ValueError("not_member")
        if member.role == ChannelMemberRole.OWNER:
            raise ValueError("owner_cannot_leave")
        await self.db.delete(member)
        ch.subscriber_count = max(0, ch.subscriber_count - 1)
        await self.db.commit()

    async def create_post(
        self,
        user: User,
        slug: str,
        post_type: PostType,
        content: str | None,
        media_content: bytes | None = None,
        media_type: str | None = None,
        is_paid: bool = False,
        price: int = 0,
        is_announcement: bool = False,
        poll_options: list[str] | None = None,
        quiz_correct_index: int | None = None,
        event_starts_at: datetime | None = None,
        event_location: str | None = None,
    ) -> dict:
        result = await self.db.execute(select(Channel).where(Channel.slug == slug))
        ch = result.scalar_one_or_none()
        if not ch:
            raise ValueError("channel_not_found")
        member = await self._get_member(ch.id, user.id)
        is_owner = ch.owner_id == user.id
        # Owner can always publish even if membership row is missing/out of sync.
        if not is_owner:
            if not member:
                raise ValueError("not_member")
            can_publish = member.role in (ChannelMemberRole.OWNER, ChannelMemberRole.ADMIN) or bool(
                member.can_post
            )
            if not can_publish:
                raise ValueError("no_permission")
        elif not member:
            member = ChannelMember(
                channel_id=ch.id,
                user_id=user.id,
                role=ChannelMemberRole.OWNER,
                **self._admin_permissions(),
            )
            self.db.add(member)
            await self.db.flush()
            ch.subscriber_count = max(ch.subscriber_count, 1)

        ptype = post_type.value if isinstance(post_type, PostType) else str(post_type)
        media_url = None
        if media_content and media_type:
            media_url = StorageService.upload_file(
                media_content, f"channels/{ch.id}/posts/{uuid.uuid4()}", media_type
            )

        cleaned_options = [o.strip() for o in (poll_options or []) if o and o.strip()]
        if ptype in (PostType.POLL.value, PostType.QUIZ.value) and len(cleaned_options) < 2:
            raise ValueError("poll_options_required")

        post = ChannelPost(
            channel_id=ch.id,
            author_id=user.id,
            post_type=ptype,
            content=content,
            media_url=media_url,
            media_type=media_type,
            is_paid=is_paid,
            price=price,
            is_announcement=is_announcement,
        )
        self.db.add(post)
        await self.db.flush()

        if ptype in (PostType.POLL.value, PostType.QUIZ.value):
            for i, opt_text in enumerate(cleaned_options):
                self.db.add(
                    PollOption(
                        post_id=post.id,
                        text=opt_text,
                        is_correct=(ptype == PostType.QUIZ.value and quiz_correct_index == i),
                    )
                )

        if ptype == PostType.EVENT.value and event_starts_at:
            self.db.add(PostEvent(post_id=post.id, starts_at=event_starts_at, location=event_location))

        await self.db.commit()
        await self.db.refresh(post)

        if is_announcement:
            try:
                await self._notify_subscribers(ch, user, f"📢 {content[:100] if content else 'Объявление'}")
            except Exception:
                # Notifications must not fail the publish response.
                pass

        return await self._post_dict(post, user)

    async def _notify_subscribers(self, channel: Channel, author: User, message: str) -> None:
        result = await self.db.execute(
            select(ChannelMember.user_id).where(ChannelMember.channel_id == channel.id)
        )
        user_ids = [str(row[0]) for row in result.all() if row[0] != author.id]
        await ws_manager.publish_many(
            user_ids,
            {
                "type": "channel_notification",
                "data": {"channel_slug": channel.slug, "channel_title": channel.title, "message": message},
            },
        )

    async def _user_purchased(self, post_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        result = await self.db.execute(
            select(PostPurchase).where(PostPurchase.post_id == post_id, PostPurchase.user_id == user_id)
        )
        return result.scalar_one_or_none() is not None

    @staticmethod
    def _post_type_value(post_type: object) -> str:
        if hasattr(post_type, "value"):
            return str(getattr(post_type, "value"))
        return str(post_type or PostType.TEXT.value).lower()

    async def _count_post_comments(self, post_id: uuid.UUID) -> int:
        try:
            result = await self.db.execute(
                select(func.count()).select_from(PostComment).where(PostComment.post_id == post_id)
            )
            return int(result.scalar() or 0)
        except Exception:
            try:
                await self.db.rollback()
            except Exception:
                pass
            return 0

    async def _post_dict(self, post: ChannelPost, viewer: User | None) -> dict:
        # Load satellites defensively: a missing related table must not abort publish/list.
        try:
            result = await self.db.execute(
                select(ChannelPost)
                .where(ChannelPost.id == post.id)
                .options(
                    selectinload(ChannelPost.poll_options),
                    selectinload(ChannelPost.event),
                    selectinload(ChannelPost.reactions),
                )
            )
            post = result.scalar_one()
        except Exception:
            try:
                await self.db.rollback()
            except Exception:
                pass
            result = await self.db.execute(select(ChannelPost).where(ChannelPost.id == post.id))
            post = result.scalar_one()

        unlocked = True
        if post.is_paid and viewer:
            member = await self._get_member(post.channel_id, viewer.id)
            is_author = post.author_id == viewer.id
            is_admin = member and member.role in (ChannelMemberRole.OWNER, ChannelMemberRole.ADMIN)
            purchased = await self._user_purchased(post.id, viewer.id)
            unlocked = is_author or is_admin or purchased
        elif post.is_paid and not viewer:
            unlocked = False

        author_res = await self.db.execute(select(User).where(User.id == post.author_id))
        author = author_res.scalar_one()

        ptype = self._post_type_value(post.post_type)
        my_vote_option_id = None
        if viewer and ptype in (PostType.POLL.value, PostType.QUIZ.value):
            try:
                vote_res = await self.db.execute(
                    select(PollVote).where(PollVote.post_id == post.id, PollVote.user_id == viewer.id)
                )
                vote = vote_res.scalar_one_or_none()
                if vote:
                    my_vote_option_id = str(vote.option_id)
            except Exception:
                try:
                    await self.db.rollback()
                except Exception:
                    pass

        poll_options = []
        try:
            for o in post.poll_options or []:
                poll_options.append(
                    {
                        "id": str(o.id),
                        "text": o.text,
                        "votes_count": o.votes_count,
                        "is_correct": o.is_correct if ptype == PostType.QUIZ.value and unlocked else False,
                    }
                )
        except Exception:
            poll_options = []

        event = None
        try:
            if post.event:
                event = {
                    "starts_at": post.event.starts_at.isoformat(),
                    "ends_at": post.event.ends_at.isoformat() if post.event.ends_at else None,
                    "location": post.event.location,
                }
        except Exception:
            event = None

        reactions = []
        try:
            reactions = [{"emoji": r.emoji, "user_id": str(r.user_id)} for r in (post.reactions or [])]
        except Exception:
            reactions = []

        created_at = post.created_at.isoformat() if post.created_at else datetime.now(timezone.utc).isoformat()

        return {
            "id": str(post.id),
            "channel_id": str(post.channel_id),
            "author_id": str(post.author_id),
            "author_username": author.username,
            "post_type": ptype,
            "content": post.content if unlocked else None,
            "content_locked": bool(post.is_paid and not unlocked),
            "price": post.price if post.is_paid else 0,
            "media_url": StorageService.generate_presigned_url(post.media_url) if unlocked else None,
            "media_type": post.media_type,
            "is_pinned": post.is_pinned,
            "is_announcement": post.is_announcement,
            "views_count": post.views_count,
            "poll_options": poll_options,
            "my_vote_option_id": my_vote_option_id,
            "event": event,
            "reactions": reactions,
            "comments_count": await self._count_post_comments(post.id),
            "created_at": created_at,
        }

    async def list_posts(self, slug: str, user: User | None, limit: int = 30) -> list[dict]:
        result = await self.db.execute(select(Channel).where(Channel.slug == slug))
        ch = result.scalar_one_or_none()
        if not ch:
            raise ValueError("channel_not_found")
        if ch.visibility == ChannelVisibility.CLOSED:
            if not user or not await self._get_member(ch.id, user.id):
                raise ValueError("channel_private")

        posts_res = await self.db.execute(
            select(ChannelPost)
            .where(ChannelPost.channel_id == ch.id)
            .order_by(ChannelPost.is_pinned.desc(), ChannelPost.created_at.desc())
            .limit(limit)
        )
        posts = posts_res.scalars().all()
        out: list[dict] = []
        for p in posts:
            try:
                out.append(await self._post_dict(p, user))
            except Exception:
                # One bad/legacy row must not blank the whole channel feed.
                try:
                    await self.db.rollback()
                except Exception:
                    pass
        return out

    async def unlock_post(self, user: User, post_id: uuid.UUID) -> dict:
        result = await self.db.execute(select(ChannelPost).where(ChannelPost.id == post_id))
        post = result.scalar_one_or_none()
        if not post or not post.is_paid:
            raise ValueError("post_not_paid")
        if await self._user_purchased(post.id, user.id):
            return await self._post_dict(post, user)
        vmoney = int(getattr(user, "vmoney_balance", 0) or 0)
        if vmoney < post.price:
            raise ValueError("insufficient_balance")
        user.vmoney_balance = vmoney - post.price
        author = await self.db.get(User, post.author_id)
        if author:
            author.vmoney_balance = int(getattr(author, "vmoney_balance", 0) or 0) + post.price
        self.db.add(PostPurchase(post_id=post.id, user_id=user.id, amount=post.price))
        await self.db.commit()
        return await self._post_dict(post, user)

    async def vote_poll(self, user: User, post_id: uuid.UUID, option_id: uuid.UUID) -> dict:
        post_res = await self.db.execute(select(ChannelPost).where(ChannelPost.id == post_id))
        post = post_res.scalar_one_or_none()
        if not post:
            raise ValueError("post_not_found")
        post_type = self._post_type_value(post.post_type)
        if post_type not in (PostType.POLL.value, PostType.QUIZ.value):
            raise ValueError("not_poll")
        await self._require_member(post.channel_id, user.id)

        opt_res = await self.db.execute(
            select(PollOption).where(PollOption.id == option_id, PollOption.post_id == post_id)
        )
        option = opt_res.scalar_one_or_none()
        if not option:
            raise ValueError("option_not_found")

        existing_res = await self.db.execute(
            select(PollVote).where(PollVote.post_id == post_id, PollVote.user_id == user.id)
        )
        existing = existing_res.scalar_one_or_none()
        if existing:
            if existing.option_id == option_id:
                return await self._post_dict(post, user)
            old_opt_res = await self.db.execute(
                select(PollOption).where(PollOption.id == existing.option_id)
            )
            old_opt = old_opt_res.scalar_one_or_none()
            if old_opt and old_opt.votes_count > 0:
                old_opt.votes_count -= 1
            existing.option_id = option_id
        else:
            self.db.add(PollVote(post_id=post_id, option_id=option_id, user_id=user.id))
        option.votes_count += 1
        await self.db.commit()
        return await self._post_dict(post, user)

    async def add_comment(self, user: User, post_id: uuid.UUID, content: str) -> dict:
        post_res = await self.db.execute(select(ChannelPost).where(ChannelPost.id == post_id))
        post = post_res.scalar_one_or_none()
        if not post:
            raise ValueError("post_not_found")
        await self._require_member(post.channel_id, user.id)
        cleaned = (content or "").strip()
        if not cleaned:
            raise ValueError("empty_comment")
        comment = PostComment(post_id=post_id, author_id=user.id, content=cleaned)
        self.db.add(comment)
        await self.db.commit()
        await self.db.refresh(comment)
        return {
            "id": str(comment.id),
            "post_id": str(comment.post_id),
            "author_id": str(user.id),
            "author_username": user.username,
            "content": comment.content,
            "created_at": comment.created_at.isoformat()
            if comment.created_at
            else datetime.now(timezone.utc).isoformat(),
        }

    async def list_comments(self, user: User | None, post_id: uuid.UUID) -> list[dict]:
        post_res = await self.db.execute(select(ChannelPost).where(ChannelPost.id == post_id))
        post = post_res.scalar_one_or_none()
        if not post:
            raise ValueError("post_not_found")
        ch = await self.db.get(Channel, post.channel_id)
        if not ch:
            raise ValueError("channel_not_found")
        if ch.visibility == ChannelVisibility.CLOSED:
            if not user or not await self._get_member(ch.id, user.id):
                raise ValueError("channel_private")
        try:
            result = await self.db.execute(
                select(PostComment, User)
                .join(User, User.id == PostComment.author_id)
                .where(PostComment.post_id == post_id)
                .order_by(PostComment.created_at.asc())
            )
        except Exception:
            try:
                await self.db.rollback()
            except Exception:
                pass
            return []
        return [
            {
                "id": str(c.id),
                "post_id": str(c.post_id),
                "author_id": str(u.id),
                "author_username": u.username,
                "content": c.content,
                "created_at": c.created_at.isoformat() if c.created_at else "",
            }
            for c, u in result.all()
        ]

    async def delete_post(self, user: User, post_id: uuid.UUID) -> None:
        post_res = await self.db.execute(select(ChannelPost).where(ChannelPost.id == post_id))
        post = post_res.scalar_one_or_none()
        if not post:
            raise ValueError("post_not_found")
        ch = await self.db.get(Channel, post.channel_id)
        if not ch:
            raise ValueError("channel_not_found")
        member = await self._get_member(ch.id, user.id)
        is_owner = ch.owner_id == user.id
        can_delete = bool(
            is_owner
            or (member and member.role in (ChannelMemberRole.OWNER, ChannelMemberRole.ADMIN))
            or (member and member.can_delete)
            or post.author_id == user.id
        )
        if not can_delete:
            raise ValueError("no_permission")
        if post.media_url:
            try:
                StorageService.delete_by_url(post.media_url)
            except Exception:
                pass
        await self.db.delete(post)
        await self.db.commit()

    async def pin_post(self, user: User, post_id: uuid.UUID) -> None:
        post_res = await self.db.execute(select(ChannelPost).where(ChannelPost.id == post_id))
        post = post_res.scalar_one_or_none()
        if not post:
            raise ValueError("post_not_found")
        member = await self._require_member(post.channel_id, user.id)
        if not member.can_pin and member.role not in (ChannelMemberRole.OWNER, ChannelMemberRole.ADMIN):
            raise ValueError("no_permission")
        post.is_pinned = True
        await self.db.commit()

    async def send_broadcast(self, user: User, slug: str, content: str, mention_all: bool = False) -> dict:
        result = await self.db.execute(select(Channel).where(Channel.slug == slug))
        ch = result.scalar_one_or_none()
        if not ch:
            raise ValueError("channel_not_found")
        member = await self._require_member(ch.id, user.id)
        if not member.can_announce and member.role not in (ChannelMemberRole.OWNER, ChannelMemberRole.ADMIN):
            raise ValueError("no_permission")

        members_res = await self.db.execute(
            select(ChannelMember).where(ChannelMember.channel_id == ch.id)
        )
        members = members_res.scalars().all()
        sent = 0
        for m in members:
            if m.user_id == user.id:
                continue
            await ws_manager.publish(
                str(m.user_id),
                {
                    "type": "channel_broadcast",
                    "data": {
                        "channel_slug": ch.slug,
                        "content": content,
                        "mention_all": mention_all,
                        "from": user.username,
                    },
                },
            )
            sent += 1

        bc = ChannelBroadcast(
            channel_id=ch.id,
            author_id=user.id,
            content=content,
            mention_all=mention_all,
            sent_count=sent,
        )
        self.db.add(bc)
        await self.db.commit()
        return {"sent_count": sent}

    async def set_member_role(
        self, user: User, slug: str, target_user_id: uuid.UUID, role: ChannelMemberRole, permissions: dict | None = None
    ) -> None:
        result = await self.db.execute(select(Channel).where(Channel.slug == slug))
        ch = result.scalar_one_or_none()
        if not ch:
            raise ValueError("channel_not_found")
        actor = await self._require_member(ch.id, user.id)
        if not actor.can_manage_members and actor.role != ChannelMemberRole.OWNER:
            raise ValueError("no_permission")
        target = await self._get_member(ch.id, target_user_id)
        if not target:
            raise ValueError("not_member")
        if target.role == ChannelMemberRole.OWNER:
            raise ValueError("cannot_modify_owner")
        if role == ChannelMemberRole.OWNER:
            raise ValueError("cannot_modify_owner")
        if role == ChannelMemberRole.ADMIN and actor.role != ChannelMemberRole.OWNER:
            raise ValueError("no_permission")
        target.role = role
        if role == ChannelMemberRole.ADMIN:
            for k, v in self._admin_permissions().items():
                setattr(target, k, v)
        elif role == ChannelMemberRole.SUBSCRIBER:
            target.can_post = False
            target.can_edit = False
            target.can_delete = False
            target.can_ban = False
            target.can_pin = False
            target.can_announce = False
            target.can_manage_members = False
        if permissions:
            if actor.role != ChannelMemberRole.OWNER:
                raise ValueError("no_permission")
            for k, v in permissions.items():
                if hasattr(target, k):
                    setattr(target, k, v)
        await self.db.commit()

    async def transfer_ownership(self, user: User, slug: str, new_owner_id: uuid.UUID) -> dict:
        result = await self.db.execute(select(Channel).where(Channel.slug == slug))
        ch = result.scalar_one_or_none()
        if not ch:
            raise ValueError("channel_not_found")
        if ch.owner_id != user.id:
            raise ValueError("no_permission")
        if new_owner_id == user.id:
            raise ValueError("cannot_transfer_to_self")
        new_owner_member = await self._get_member(ch.id, new_owner_id)
        if not new_owner_member:
            raise ValueError("not_member")
        old_owner_member = await self._get_member(ch.id, user.id)
        if not old_owner_member:
            raise ValueError("not_member")

        old_owner_member.role = ChannelMemberRole.ADMIN
        for k, v in self._admin_permissions().items():
            setattr(old_owner_member, k, v)

        new_owner_member.role = ChannelMemberRole.OWNER
        for k, v in self._admin_permissions().items():
            setattr(new_owner_member, k, v)
        ch.owner_id = new_owner_id
        await self.db.commit()
        await self.db.refresh(ch)
        return self._channel_dict(ch, True, False, old_owner_member)

    async def list_members(self, user: User, slug: str) -> list[dict]:
        result = await self.db.execute(select(Channel).where(Channel.slug == slug))
        ch = result.scalar_one_or_none()
        if not ch:
            raise ValueError("channel_not_found")
        await self._require_member(ch.id, user.id)
        rows = await self.db.execute(
            select(ChannelMember, User)
            .join(User, User.id == ChannelMember.user_id)
            .where(ChannelMember.channel_id == ch.id)
            .order_by(ChannelMember.joined_at.asc())
        )
        out = []
        for member, u in rows.all():
            out.append(
                {
                    "user_id": str(u.id),
                    "username": u.username,
                    "display_name": u.display_name,
                    "avatar_url": StorageService.generate_presigned_url(u.avatar_url),
                    "role": member.role.value,
                    "is_official_verified": bool(u.is_official_verified),
                    "joined_at": member.joined_at.isoformat(),
                }
            )
        return out

    async def submit_verification_request(
        self,
        user: User,
        slug: str,
        reason: str,
        link_website: str | None = None,
        link_social: str | None = None,
    ) -> dict:
        result = await self.db.execute(select(Channel).where(Channel.slug == slug))
        ch = result.scalar_one_or_none()
        if not ch:
            raise ValueError("channel_not_found")
        if ch.owner_id != user.id:
            raise ValueError("no_permission")
        if ch.is_verified:
            raise ValueError("already_verified")
        pending = await self.db.execute(
            select(ChannelVerificationRequest).where(
                ChannelVerificationRequest.channel_id == ch.id,
                ChannelVerificationRequest.status == ChannelVerificationRequestStatus.PENDING.value,
            )
        )
        if pending.scalar_one_or_none():
            raise ValueError("request_pending")
        cleaned = (reason or "").strip()
        if len(cleaned) < 20:
            raise ValueError("reason_too_short")
        if not ((link_website and link_website.strip()) or (link_social and link_social.strip())):
            raise ValueError("link_required")
        req = ChannelVerificationRequest(
            channel_id=ch.id,
            requested_by_id=user.id,
            reason=cleaned,
            link_website=(link_website or "").strip() or None,
            link_social=(link_social or "").strip() or None,
            status=ChannelVerificationRequestStatus.PENDING.value,
        )
        self.db.add(req)
        await self.db.commit()
        await self.db.refresh(req)
        return self._verification_dict(req, ch)

    async def get_verification_request(self, user: User, slug: str) -> dict | None:
        result = await self.db.execute(select(Channel).where(Channel.slug == slug))
        ch = result.scalar_one_or_none()
        if not ch:
            raise ValueError("channel_not_found")
        if ch.owner_id != user.id:
            raise ValueError("no_permission")
        req_res = await self.db.execute(
            select(ChannelVerificationRequest)
            .where(ChannelVerificationRequest.channel_id == ch.id)
            .order_by(ChannelVerificationRequest.created_at.desc())
            .limit(1)
        )
        req = req_res.scalar_one_or_none()
        return self._verification_dict(req, ch) if req else None

    def _verification_dict(self, req: ChannelVerificationRequest, ch: Channel | None = None) -> dict:
        return {
            "id": str(req.id),
            "channel_id": str(req.channel_id),
            "channel_slug": ch.slug if ch else None,
            "channel_title": ch.title if ch else None,
            "requested_by_id": str(req.requested_by_id),
            "reason": req.reason,
            "link_website": req.link_website,
            "link_social": req.link_social,
            "status": req.status,
            "admin_note": req.admin_note,
            "reviewed_at": req.reviewed_at.isoformat() if req.reviewed_at else None,
            "created_at": req.created_at.isoformat(),
        }

    async def list_verification_requests(self, status: str | None = None) -> list[dict]:
        try:
            q = (
                select(ChannelVerificationRequest, Channel)
                .join(Channel, Channel.id == ChannelVerificationRequest.channel_id)
                .order_by(ChannelVerificationRequest.created_at.desc())
            )
            if status:
                q = q.where(ChannelVerificationRequest.status == status)
            result = await self.db.execute(q.limit(100))
            return [self._verification_dict(req, ch) for req, ch in result.all()]
        except Exception:
            return []

    async def review_verification_request(
        self,
        admin: User,
        request_id: uuid.UUID,
        approve: bool,
        admin_note: str | None = None,
    ) -> dict:
        result = await self.db.execute(
            select(ChannelVerificationRequest, Channel)
            .join(Channel, Channel.id == ChannelVerificationRequest.channel_id)
            .where(ChannelVerificationRequest.id == request_id)
        )
        row = result.one_or_none()
        if not row:
            raise ValueError("request_not_found")
        req, ch = row
        if req.status != ChannelVerificationRequestStatus.PENDING.value:
            raise ValueError("request_already_reviewed")
        req.status = (
            ChannelVerificationRequestStatus.APPROVED.value
            if approve
            else ChannelVerificationRequestStatus.REJECTED.value
        )
        req.admin_note = admin_note
        req.reviewed_by_id = admin.id
        req.reviewed_at = datetime.now(timezone.utc)
        if approve:
            ch.is_verified = True
        await self.db.commit()
        await self.db.refresh(req)
        return self._verification_dict(req, ch)

    async def verify_channel(self, slug: str, verified: bool = True) -> None:
        result = await self.db.execute(select(Channel).where(Channel.slug == slug))
        ch = result.scalar_one_or_none()
        if not ch:
            raise ValueError("channel_not_found")
        ch.is_verified = verified
        await self.db.commit()

    async def create_product(self, user: User, slug: str, title: str, price: int, description: str | None) -> dict:
        result = await self.db.execute(select(Channel).where(Channel.slug == slug))
        ch = result.scalar_one_or_none()
        if not ch:
            raise ValueError("channel_not_found")
        member = await self._require_member(ch.id, user.id)
        if member.role not in (ChannelMemberRole.OWNER, ChannelMemberRole.ADMIN) and not member.can_post:
            raise ValueError("no_permission")
        product = ChannelProduct(channel_id=ch.id, title=title, price=price, description=description)
        self.db.add(product)
        await self.db.commit()
        await self.db.refresh(product)
        return {
            "id": str(product.id),
            "title": product.title,
            "price": product.price,
            "description": product.description,
        }

    async def list_products(self, slug: str, user: User | None = None) -> list[dict]:
        result = await self.db.execute(select(Channel).where(Channel.slug == slug))
        ch = result.scalar_one_or_none()
        if not ch:
            raise ValueError("channel_not_found")
        if ch.visibility == ChannelVisibility.CLOSED:
            if not user or not await self._get_member(ch.id, user.id):
                raise ValueError("channel_private")
        res = await self.db.execute(
            select(ChannelProduct).where(ChannelProduct.channel_id == ch.id, ChannelProduct.is_active == True)
        )
        return [
            {
                "id": str(p.id),
                "title": p.title,
                "price": p.price,
                "description": p.description,
                "image_url": StorageService.generate_presigned_url(p.image_url),
            }
            for p in res.scalars().all()
        ]
