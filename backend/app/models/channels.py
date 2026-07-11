import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

DEFAULT_MEMBER_LIMIT = 500
EXTENDED_MEMBER_LIMIT = 1000
GROUP_EXTENSION_PRICE = 500


class ChannelVisibility(str, enum.Enum):
    PUBLIC = "public"
    CLOSED = "closed"


class ChannelMemberRole(str, enum.Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MODERATOR = "moderator"
    SUBSCRIBER = "subscriber"


class PostType(str, enum.Enum):
    TEXT = "text"
    MEDIA = "media"
    POLL = "poll"
    QUIZ = "quiz"
    EVENT = "event"


class Channel(Base):
    __tablename__ = "channels"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(128))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    visibility: Mapped[ChannelVisibility] = mapped_column(Enum(ChannelVisibility), default=ChannelVisibility.PUBLIC)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    subscriber_count: Mapped[int] = mapped_column(Integer, default=0)
    subscription_price: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    members: Mapped[list["ChannelMember"]] = relationship(back_populates="channel", cascade="all, delete-orphan")
    posts: Mapped[list["ChannelPost"]] = relationship(back_populates="channel", cascade="all, delete-orphan")


class ChannelMember(Base):
    __tablename__ = "channel_members"
    __table_args__ = (UniqueConstraint("channel_id", "user_id", name="uq_channel_member"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    channel_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("channels.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[ChannelMemberRole] = mapped_column(Enum(ChannelMemberRole), default=ChannelMemberRole.SUBSCRIBER)
    can_post: Mapped[bool] = mapped_column(Boolean, default=False)
    can_edit: Mapped[bool] = mapped_column(Boolean, default=False)
    can_delete: Mapped[bool] = mapped_column(Boolean, default=False)
    can_ban: Mapped[bool] = mapped_column(Boolean, default=False)
    can_pin: Mapped[bool] = mapped_column(Boolean, default=False)
    can_announce: Mapped[bool] = mapped_column(Boolean, default=False)
    can_manage_members: Mapped[bool] = mapped_column(Boolean, default=False)
    is_subscriber_paid: Mapped[bool] = mapped_column(Boolean, default=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    channel: Mapped["Channel"] = relationship(back_populates="members")


class ChannelPost(Base):
    __tablename__ = "channel_posts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    channel_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("channels.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    post_type: Mapped[PostType] = mapped_column(Enum(PostType), default=PostType.TEXT)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    media_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    media_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_paid: Mapped[bool] = mapped_column(Boolean, default=False)
    price: Mapped[int] = mapped_column(Integer, default=0)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    is_announcement: Mapped[bool] = mapped_column(Boolean, default=False)
    views_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    channel: Mapped["Channel"] = relationship(back_populates="posts")
    poll_options: Mapped[list["PollOption"]] = relationship(back_populates="post", cascade="all, delete-orphan")
    event: Mapped["PostEvent | None"] = relationship(back_populates="post", uselist=False, cascade="all, delete-orphan")
    comments: Mapped[list["PostComment"]] = relationship(back_populates="post", cascade="all, delete-orphan")
    reactions: Mapped[list["PostReaction"]] = relationship(back_populates="post", cascade="all, delete-orphan")


class PollOption(Base):
    __tablename__ = "poll_options"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("channel_posts.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(String(256))
    votes_count: Mapped[int] = mapped_column(Integer, default=0)
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False)

    post: Mapped["ChannelPost"] = relationship(back_populates="poll_options")


class PollVote(Base):
    __tablename__ = "poll_votes"
    __table_args__ = (UniqueConstraint("post_id", "user_id", name="uq_poll_vote"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("channel_posts.id", ondelete="CASCADE"))
    option_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("poll_options.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PostEvent(Base):
    __tablename__ = "post_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("channel_posts.id", ondelete="CASCADE"), unique=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    location: Mapped[str | None] = mapped_column(String(256), nullable=True)

    post: Mapped["ChannelPost"] = relationship(back_populates="event")


class PostComment(Base):
    __tablename__ = "post_comments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("channel_posts.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    post: Mapped["ChannelPost"] = relationship(back_populates="comments")


class PostReaction(Base):
    __tablename__ = "post_reactions"
    __table_args__ = (UniqueConstraint("post_id", "user_id", "emoji", name="uq_post_reaction"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("channel_posts.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    emoji: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    post: Mapped["ChannelPost"] = relationship(back_populates="reactions")


class PostPurchase(Base):
    __tablename__ = "post_purchases"
    __table_args__ = (UniqueConstraint("post_id", "user_id", name="uq_post_purchase"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("channel_posts.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    amount: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ChannelProduct(Base):
    __tablename__ = "channel_products"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    channel_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("channels.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(128))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[int] = mapped_column(Integer)
    image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ChannelBroadcast(Base):
    __tablename__ = "channel_broadcasts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    channel_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("channels.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    content: Mapped[str] = mapped_column(Text)
    mention_all: Mapped[bool] = mapped_column(Boolean, default=False)
    sent_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
