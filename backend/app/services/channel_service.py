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

        channel = Channel(
            title=title,
            slug=slug,
            description=description,
            owner_id=user.id,
            visibility=visibility,
            subscription_price=subscription_price,
            subscriber_count=1,
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
            if user:
                m = await self._get_member(ch.id, user.id)
                is_member = m is not None
            if ch.visibility == ChannelVisibility.CLOSED and not is_member:
                continue
            out.append(self._channel_dict(ch, is_member))
        return out

    def _channel_dict(self, ch: Channel, is_member: bool = False) -> dict:
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
            "created_at": ch.created_at.isoformat(),
        }

    async def get_channel(self, slug: str, user: User | None) -> dict:
        result = await self.db.execute(select(Channel).where(Channel.slug == slug))
        ch = result.scalar_one_or_none()
        if not ch:
            raise ValueError("channel_not_found")
        is_member = False
        if user:
            is_member = await self._get_member(ch.id, user.id) is not None
        if ch.visibility == ChannelVisibility.CLOSED and not is_member:
            raise ValueError("channel_private")
        return self._channel_dict(ch, is_member)

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
            if user.wallet_balance < ch.subscription_price:
                raise ValueError("insufficient_balance")
            user.wallet_balance -= ch.subscription_price
            owner = await self.db.get(User, ch.owner_id)
            if owner:
                owner.wallet_balance += ch.subscription_price
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
        return self._channel_dict(ch, True)

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
        member = await self._require_member(ch.id, user.id)
        if not member.can_post and member.role not in (ChannelMemberRole.OWNER, ChannelMemberRole.ADMIN):
            raise ValueError("no_permission")

        media_url = None
        if media_content and media_type:
            media_url = StorageService.upload_file(
                media_content, f"channels/{ch.id}/posts/{uuid.uuid4()}", media_type
            )

        post = ChannelPost(
            channel_id=ch.id,
            author_id=user.id,
            post_type=post_type,
            content=content,
            media_url=media_url,
            media_type=media_type,
            is_paid=is_paid,
            price=price,
            is_announcement=is_announcement,
        )
        self.db.add(post)
        await self.db.flush()

        if post_type in (PostType.POLL, PostType.QUIZ) and poll_options:
            for i, opt_text in enumerate(poll_options):
                self.db.add(
                    PollOption(
                        post_id=post.id,
                        text=opt_text,
                        is_correct=(post_type == PostType.QUIZ and quiz_correct_index == i),
                    )
                )

        if post_type == PostType.EVENT and event_starts_at:
            self.db.add(PostEvent(post_id=post.id, starts_at=event_starts_at, location=event_location))

        await self.db.commit()
        await self.db.refresh(post)

        if is_announcement:
            await self._notify_subscribers(ch, user, f"📢 {content[:100] if content else 'Объявление'}")

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

    async def _post_dict(self, post: ChannelPost, viewer: User | None) -> dict:
        result = await self.db.execute(
            select(ChannelPost)
            .where(ChannelPost.id == post.id)
            .options(
                selectinload(ChannelPost.poll_options),
                selectinload(ChannelPost.event),
                selectinload(ChannelPost.reactions),
                selectinload(ChannelPost.comments),
            )
        )
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

        return {
            "id": str(post.id),
            "channel_id": str(post.channel_id),
            "author_id": str(post.author_id),
            "author_username": author.username,
            "post_type": post.post_type.value,
            "content": post.content if unlocked else None,
            "content_locked": post.is_paid and not unlocked,
            "price": post.price if post.is_paid else 0,
            "media_url": StorageService.generate_presigned_url(post.media_url) if unlocked else None,
            "media_type": post.media_type,
            "is_pinned": post.is_pinned,
            "is_announcement": post.is_announcement,
            "views_count": post.views_count,
            "poll_options": [
                {"id": str(o.id), "text": o.text, "votes_count": o.votes_count, "is_correct": o.is_correct if post.post_type == PostType.QUIZ and unlocked else False}
                for o in post.poll_options
            ],
            "event": {
                "starts_at": post.event.starts_at.isoformat(),
                "ends_at": post.event.ends_at.isoformat() if post.event and post.event.ends_at else None,
                "location": post.event.location if post.event else None,
            } if post.event else None,
            "reactions": [{"emoji": r.emoji, "user_id": str(r.user_id)} for r in post.reactions],
            "comments_count": len(post.comments),
            "created_at": post.created_at.isoformat(),
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
        return [await self._post_dict(p, user) for p in posts]

    async def unlock_post(self, user: User, post_id: uuid.UUID) -> dict:
        result = await self.db.execute(select(ChannelPost).where(ChannelPost.id == post_id))
        post = result.scalar_one_or_none()
        if not post or not post.is_paid:
            raise ValueError("post_not_paid")
        if await self._user_purchased(post.id, user.id):
            return await self._post_dict(post, user)
        if user.wallet_balance < post.price:
            raise ValueError("insufficient_balance")
        user.wallet_balance -= post.price
        author = await self.db.get(User, post.author_id)
        if author:
            author.wallet_balance += post.price
        self.db.add(PostPurchase(post_id=post.id, user_id=user.id, amount=post.price))
        await self.db.commit()
        return await self._post_dict(post, user)

    async def vote_poll(self, user: User, post_id: uuid.UUID, option_id: uuid.UUID) -> dict:
        post_res = await self.db.execute(select(ChannelPost).where(ChannelPost.id == post_id))
        post = post_res.scalar_one_or_none()
        if not post or post.post_type not in (PostType.POLL, PostType.QUIZ):
            raise ValueError("not_poll")
        await self._require_member(post.channel_id, user.id)

        existing = await self.db.execute(
            select(PollVote).where(PollVote.post_id == post_id, PollVote.user_id == user.id)
        )
        if existing.scalar_one_or_none():
            raise ValueError("already_voted")

        opt_res = await self.db.execute(
            select(PollOption).where(PollOption.id == option_id, PollOption.post_id == post_id)
        )
        option = opt_res.scalar_one_or_none()
        if not option:
            raise ValueError("option_not_found")

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
        self.db.add(PostComment(post_id=post_id, author_id=user.id, content=content))
        await self.db.commit()
        return await self._post_dict(post, user)

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
        if permissions:
            if actor.role != ChannelMemberRole.OWNER:
                raise ValueError("no_permission")
            for k, v in permissions.items():
                if hasattr(target, k):
                    setattr(target, k, v)
        await self.db.commit()

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
