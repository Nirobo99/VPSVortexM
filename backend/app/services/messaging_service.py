import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import decrypt_message, encrypt_message
from app.models.messaging import (
    ChatFolder,
    Dialog,
    DialogParticipant,
    DialogType,
    Message,
    MessageReaction,
    MessageType,
)
from app.models.social import BlockedUser
from app.models.user import User
from app.services.storage_service import StorageService
from app.services.unread_service import UnreadService
from app.services.ws_manager import ws_manager

_GROUP_BAN_LABELS = {
    "spam": "СПАМ",
    "ads": "Не согласованная реклама",
    "disrespect": "Не уважение к участникам и администрации а так же за многочисленые жалобы",
}


def _group_ban_message(reason: str | None) -> str:
    label = _GROUP_BAN_LABELS.get(reason or "", reason or "")
    return f"Вы заблокированы и не можете писать сообщения по причине {label}"


class MessagingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _direct_key(user_a: uuid.UUID, user_b: uuid.UUID, is_secret: bool) -> str:
        ids = sorted([str(user_a), str(user_b)])
        prefix = "secret" if is_secret else "direct"
        return f"{prefix}:{ids[0]}:{ids[1]}"

    async def _is_blocked(self, user_id: uuid.UUID, other_id: uuid.UUID) -> bool:
        result = await self.db.execute(
            select(BlockedUser).where(
                or_(
                    and_(BlockedUser.user_id == user_id, BlockedUser.blocked_user_id == other_id),
                    and_(BlockedUser.user_id == other_id, BlockedUser.blocked_user_id == user_id),
                )
            )
        )
        return result.scalar_one_or_none() is not None

    async def _get_participant(self, dialog_id: uuid.UUID, user_id: uuid.UUID) -> DialogParticipant | None:
        result = await self.db.execute(
            select(DialogParticipant).where(
                DialogParticipant.dialog_id == dialog_id,
                DialogParticipant.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def _require_participant(self, dialog_id: uuid.UUID, user_id: uuid.UUID) -> DialogParticipant:
        participant = await self._get_participant(dialog_id, user_id)
        if not participant:
            raise ValueError("dialog_not_found")
        return participant

    async def create_folder(self, user: User, name: str) -> ChatFolder:
        result = await self.db.execute(
            select(func.max(ChatFolder.position)).where(ChatFolder.user_id == user.id)
        )
        max_pos = result.scalar() or 0
        folder = ChatFolder(user_id=user.id, name=name, position=max_pos + 1)
        self.db.add(folder)
        await self.db.commit()
        await self.db.refresh(folder)
        return folder

    async def list_folders(self, user: User) -> list[ChatFolder]:
        result = await self.db.execute(
            select(ChatFolder).where(ChatFolder.user_id == user.id).order_by(ChatFolder.position)
        )
        return list(result.scalars().all())

    async def update_folder(self, user: User, folder_id: uuid.UUID, name: str | None, position: int | None) -> ChatFolder:
        result = await self.db.execute(
            select(ChatFolder).where(ChatFolder.id == folder_id, ChatFolder.user_id == user.id)
        )
        folder = result.scalar_one_or_none()
        if not folder:
            raise ValueError("folder_not_found")
        if name is not None:
            folder.name = name
        if position is not None:
            folder.position = position
        await self.db.commit()
        await self.db.refresh(folder)
        return folder

    async def delete_folder(self, user: User, folder_id: uuid.UUID) -> None:
        result = await self.db.execute(
            select(ChatFolder).where(ChatFolder.id == folder_id, ChatFolder.user_id == user.id)
        )
        folder = result.scalar_one_or_none()
        if not folder:
            raise ValueError("folder_not_found")
        await self.db.execute(
            select(DialogParticipant)
        )
        parts = await self.db.execute(
            select(DialogParticipant).where(DialogParticipant.folder_id == folder_id, DialogParticipant.user_id == user.id)
        )
        for p in parts.scalars().all():
            p.folder_id = None
        await self.db.delete(folder)
        await self.db.commit()

    async def get_or_create_dialog(
        self, user: User, other: User, is_secret: bool = False, auto_delete_seconds: int | None = None
    ) -> Dialog:
        if user.id == other.id:
            raise ValueError("cannot_chat_self")
        if await self._is_blocked(user.id, other.id):
            raise ValueError("user_blocked")

        dkey = self._direct_key(user.id, other.id, is_secret)
        result = await self.db.execute(select(Dialog).where(Dialog.direct_key == dkey))
        dialog = result.scalar_one_or_none()
        if dialog:
            participant = await self._get_participant(dialog.id, user.id)
            if participant and participant.is_hidden:
                participant.is_hidden = False
                await self.db.commit()
            return dialog

        dialog = Dialog(
            dialog_type=DialogType.SECRET if is_secret else DialogType.DIRECT,
            direct_key=dkey,
            auto_delete_seconds=auto_delete_seconds,
        )
        self.db.add(dialog)
        await self.db.flush()
        for uid in (user.id, other.id):
            self.db.add(DialogParticipant(dialog_id=dialog.id, user_id=uid))
        await self.db.commit()
        await self.db.refresh(dialog)
        return dialog

    async def list_dialogs(self, user: User) -> list[dict]:
        result = await self.db.execute(
            select(DialogParticipant, Dialog)
            .join(Dialog, Dialog.id == DialogParticipant.dialog_id)
            .where(DialogParticipant.user_id == user.id, DialogParticipant.is_hidden == False)
            .order_by(Dialog.last_message_at.desc().nullslast())
        )
        items = []
        for participant, dialog in result.all():
            other = None
            member_count = None
            if dialog.dialog_type == DialogType.GROUP:
                count_res = await self.db.execute(
                    select(func.count()).select_from(DialogParticipant).where(DialogParticipant.dialog_id == dialog.id)
                )
                member_count = count_res.scalar() or 0
            else:
                other = await self._get_other_participant(dialog.id, user.id)
            unread = await UnreadService.get(str(user.id), str(dialog.id))
            is_secret = dialog.dialog_type == DialogType.SECRET
            preview = await self._last_message_preview(dialog.id, is_secret)
            items.append({
                "dialog": dialog,
                "participant": participant,
                "other_user": other,
                "member_count": member_count,
                "unread_count": unread,
                "last_message_preview": preview,
            })
        return items

    async def get_unread_summary(self, user: User) -> dict:
        result = await self.db.execute(
            select(DialogParticipant, Dialog)
            .join(Dialog, Dialog.id == DialogParticipant.dialog_id)
            .where(DialogParticipant.user_id == user.id, DialogParticipant.is_hidden == False)
        )
        chats = 0
        groups = 0
        for participant, dialog in result.all():
            n = await UnreadService.get(str(user.id), str(dialog.id))
            if dialog.dialog_type == DialogType.GROUP:
                groups += n
            else:
                chats += n

        from app.models.channels import ChannelMember

        ch_res = await self.db.execute(
            select(ChannelMember.channel_id).where(ChannelMember.user_id == user.id)
        )
        channel_ids = [str(row[0]) for row in ch_res.all()]
        channels = await UnreadService.get_channels_total(str(user.id), channel_ids)
        return {
            "chats": chats,
            "groups": groups,
            "channels": channels,
            "total": chats + groups + channels,
        }

    async def _get_other_participant(self, dialog_id: uuid.UUID, user_id: uuid.UUID) -> User | None:
        result = await self.db.execute(
            select(User)
            .join(DialogParticipant, DialogParticipant.user_id == User.id)
            .where(DialogParticipant.dialog_id == dialog_id, DialogParticipant.user_id != user_id)
        )
        return result.scalar_one_or_none()

    async def _last_message_preview(self, dialog_id: uuid.UUID, is_secret: bool) -> str | None:
        result = await self.db.execute(
            select(Message)
            .where(Message.dialog_id == dialog_id, Message.is_deleted == False)
            .order_by(Message.created_at.desc())
            .limit(1)
        )
        msg = result.scalar_one_or_none()
        if not msg:
            return None
        if is_secret:
            return "🔒"
        if msg.message_type == MessageType.TEXT:
            if msg.encrypted_content or msg.content_encrypted:
                try:
                    return self._decrypt_content(msg, False)[:100] if self._decrypt_content(msg, False) else None
                except Exception:
                    return "..."
            return None
        return f"[{msg.message_type.value}]"

    async def get_dialog_detail(self, user: User, dialog_id: uuid.UUID) -> dict:
        participant = await self._require_participant(dialog_id, user.id)
        result = await self.db.execute(
            select(Dialog).where(Dialog.id == dialog_id).options(selectinload(Dialog.participants))
        )
        dialog = result.scalar_one_or_none()
        if not dialog:
            raise ValueError("dialog_not_found")

        users_result = await self.db.execute(
            select(User, DialogParticipant)
            .join(DialogParticipant, DialogParticipant.user_id == User.id)
            .where(DialogParticipant.dialog_id == dialog_id)
        )
        participants = []
        for u, p in users_result.all():
            participants.append({
                "user": u,
                "e2e_public_key": p.e2e_public_key,
                "last_read_at": p.last_read_at.isoformat() if p.last_read_at else None,
                "role": p.role,
                "is_admin": p.is_admin,
                "ban_reason": getattr(p, "ban_reason", None),
                "banned_until": p.banned_until.isoformat() if getattr(p, "banned_until", None) else None,
            })

        unread = await UnreadService.get(str(user.id), str(dialog.id))
        banned = False
        ban_reason = getattr(participant, "ban_reason", None)
        banned_until = getattr(participant, "banned_until", None)
        if ban_reason:
            now = datetime.now(timezone.utc)
            if banned_until is not None and banned_until <= now:
                participant.ban_reason = None
                participant.banned_until = None
                participant.can_post = True
                await self.db.flush()
                ban_reason = None
                banned_until = None
            else:
                banned = True
        pinned_preview = None
        if participant.pinned_message_id:
            pin_res = await self.db.execute(
                select(Message).where(
                    Message.id == participant.pinned_message_id,
                    Message.dialog_id == dialog_id,
                )
            )
            pinned_msg = pin_res.scalar_one_or_none()
            if pinned_msg and not pinned_msg.is_deleted:
                is_secret = dialog.dialog_type == DialogType.SECRET
                content = self._decrypt_content(pinned_msg, is_secret)
                if is_secret:
                    pinned_preview = "🔒"
                elif content:
                    pinned_preview = content[:120]
                else:
                    pinned_preview = f"[{pinned_msg.message_type.value}]"
        return {
            "dialog": dialog,
            "participant": participant,
            "participants": participants,
            "unread_count": unread,
            "my_role": participant.role,
            "can_moderate": bool(participant.can_moderate or participant.is_admin or participant.role == "owner"),
            "is_banned": banned,
            "ban_reason": ban_reason,
            "banned_until": banned_until.isoformat() if banned_until else None,
            "ban_message": (
                _group_ban_message(ban_reason) if banned else None
            ),
            "pinned_message_preview": pinned_preview,
        }

    async def set_e2e_key(self, user: User, dialog_id: uuid.UUID, public_key: str) -> None:
        participant = await self._require_participant(dialog_id, user.id)
        result = await self.db.execute(select(Dialog).where(Dialog.id == dialog_id))
        dialog = result.scalar_one()
        if dialog.dialog_type != DialogType.SECRET:
            raise ValueError("not_secret_dialog")
        participant.e2e_public_key = public_key
        await self.db.commit()
        other_ids = await self._other_user_ids(dialog_id, user.id)
        await ws_manager.publish_many(
            [str(uid) for uid in other_ids],
            {"type": "e2e_key", "dialog_id": str(dialog_id), "user_id": str(user.id), "public_key": public_key},
        )

    async def hide_dialog(self, user: User, dialog_id: uuid.UUID) -> None:
        participant = await self._require_participant(dialog_id, user.id)
        participant.is_hidden = True
        await UnreadService.reset(str(user.id), str(dialog_id))
        await self.db.commit()

    async def _other_user_ids(self, dialog_id: uuid.UUID, exclude_user_id: uuid.UUID) -> list[uuid.UUID]:
        result = await self.db.execute(
            select(DialogParticipant.user_id).where(
                DialogParticipant.dialog_id == dialog_id,
                DialogParticipant.user_id != exclude_user_id,
            )
        )
        return [row[0] for row in result.all()]

    async def move_dialog_folder(self, user: User, dialog_id: uuid.UUID, folder_id: uuid.UUID | None) -> None:
        participant = await self._require_participant(dialog_id, user.id)
        if folder_id:
            result = await self.db.execute(
                select(ChatFolder).where(ChatFolder.id == folder_id, ChatFolder.user_id == user.id)
            )
            if not result.scalar_one_or_none():
                raise ValueError("folder_not_found")
        participant.folder_id = folder_id
        await self.db.commit()

    async def mark_read(self, user: User, dialog_id: uuid.UUID) -> None:
        participant = await self._require_participant(dialog_id, user.id)
        participant.last_read_at = datetime.now(timezone.utc)
        await UnreadService.reset(str(user.id), str(dialog_id))
        await self.db.commit()
        other_ids = await self._other_user_ids(dialog_id, user.id)
        await ws_manager.publish_many(
            [str(uid) for uid in other_ids],
            {
                "type": "message_read",
                "dialog_id": str(dialog_id),
                "user_id": str(user.id),
                "last_read_at": participant.last_read_at.isoformat(),
            },
        )

    async def pin_message(self, user: User, dialog_id: uuid.UUID, message_id: uuid.UUID | None) -> None:
        participant = await self._require_participant(dialog_id, user.id)
        result = await self.db.execute(select(Dialog).where(Dialog.id == dialog_id))
        dialog = result.scalar_one_or_none()
        if not dialog:
            raise ValueError("dialog_not_found")
        if message_id:
            msg_res = await self.db.execute(
                select(Message).where(Message.id == message_id, Message.dialog_id == dialog_id)
            )
            if not msg_res.scalar_one_or_none():
                raise ValueError("message_not_found")
        if dialog.dialog_type == DialogType.GROUP:
            can_pin = bool(
                participant.can_moderate
                or participant.is_admin
                or participant.role == "owner"
                or dialog.owner_id == user.id
            )
            if not can_pin:
                raise ValueError("no_permission")
            parts = await self.db.execute(
                select(DialogParticipant).where(DialogParticipant.dialog_id == dialog_id)
            )
            for p in parts.scalars().all():
                p.pinned_message_id = message_id
        else:
            participant.pinned_message_id = message_id
        await self.db.commit()
        member_ids = await self._other_user_ids(dialog_id, user.id)
        await ws_manager.publish_many(
            [str(uid) for uid in member_ids] + [str(user.id)],
            {
                "type": "message_pinned",
                "dialog_id": str(dialog_id),
                "message_id": str(message_id) if message_id else None,
            },
        )

    def _decrypt_content(self, msg: Message, is_secret: bool) -> str | None:
        if is_secret:
            return msg.content_e2e
        if msg.encrypted_content:
            try:
                return decrypt_message(msg.encrypted_content)
            except Exception:
                return None
        if msg.content_encrypted:
            try:
                import base64

                return decrypt_message(base64.b64decode(msg.content_encrypted))
            except Exception:
                return None
        return None

    def _message_to_dict(self, msg: Message, sender: User | None, is_secret: bool, reply: Message | None = None) -> dict:
        reactions = [
            {
                "emoji": r.emoji,
                "user_id": str(r.user_id),
                "username": r.user.username if r.user else "",
            }
            for r in (msg.reactions or [])
        ]
        reply_preview = None
        if reply:
            reply_preview = {
                "id": str(reply.id),
                "sender_id": str(reply.sender_id),
                "content_preview": self._decrypt_content(reply, is_secret),
                "message_type": reply.message_type.value.lower(),
                "is_deleted": reply.is_deleted,
            }
        return {
            "id": str(msg.id),
            "dialog_id": str(msg.dialog_id),
            "sender_id": str(msg.sender_id),
            "sender_username": sender.username if sender else "",
            "sender_display_name": sender.display_name if sender else None,
            "message_type": msg.message_type.value.lower(),
            "content": self._decrypt_content(msg, is_secret) if not is_secret else None,
            "content_e2e": msg.content_e2e if is_secret else None,
            "media_url": StorageService.generate_presigned_url(msg.media_url),
            "media_type": msg.media_type,
            "file_name": msg.file_name,
            "file_size": msg.file_size,
            "reply_to": reply_preview,
            "forward_from_message_id": str(msg.forward_from_message_id) if msg.forward_from_message_id else None,
            "is_edited": msg.is_edited,
            "is_deleted": msg.is_deleted,
            "auto_delete_at": msg.auto_delete_at.isoformat() if msg.auto_delete_at else None,
            "reactions": reactions,
            "created_at": msg.created_at.isoformat(),
        }

    async def get_messages(
        self, user: User, dialog_id: uuid.UUID, cursor: str | None = None, limit: int = 50
    ) -> dict:
        await self._require_participant(dialog_id, user.id)
        result = await self.db.execute(select(Dialog).where(Dialog.id == dialog_id))
        dialog = result.scalar_one()
        is_secret = dialog.dialog_type == DialogType.SECRET

        query = (
            select(Message)
            .where(Message.dialog_id == dialog_id)
            .options(
                selectinload(Message.reactions).selectinload(MessageReaction.user),
            )
            .order_by(Message.created_at.desc())
            .limit(limit + 1)
        )
        if cursor:
            cursor_dt = datetime.fromisoformat(cursor)
            query = query.where(Message.created_at < cursor_dt)

        rows = list((await self.db.execute(query)).scalars().all())
        has_more = len(rows) > limit
        if has_more:
            rows = rows[:limit]

        reply_ids = [m.reply_to_id for m in rows if m.reply_to_id]
        replies: dict[uuid.UUID, Message] = {}
        if reply_ids:
            rep_result = await self.db.execute(select(Message).where(Message.id.in_(reply_ids)))
            for m in rep_result.scalars().all():
                replies[m.id] = m

        sender_ids = {m.sender_id for m in rows}
        senders: dict[uuid.UUID, User] = {}
        if sender_ids:
            s_result = await self.db.execute(select(User).where(User.id.in_(sender_ids)))
            for u in s_result.scalars().all():
                senders[u.id] = u

        messages = []
        for msg in reversed(rows):
            messages.append(
                self._message_to_dict(msg, senders.get(msg.sender_id), is_secret, replies.get(msg.reply_to_id) if msg.reply_to_id else None)
            )

        next_cursor = rows[-1].created_at.isoformat() if has_more and rows else None
        return {"messages": messages, "has_more": has_more, "next_cursor": next_cursor}

    async def send_message(
        self,
        user: User,
        dialog_id: uuid.UUID,
        message_type: MessageType,
        content: str | None = None,
        content_e2e: str | None = None,
        reply_to_id: uuid.UUID | None = None,
        auto_delete_seconds: int | None = None,
        media_content: bytes | None = None,
        media_content_type: str | None = None,
        file_name: str | None = None,
    ) -> dict:
        participant = await self._require_participant(dialog_id, user.id)
        result = await self.db.execute(select(Dialog).where(Dialog.id == dialog_id))
        dialog = result.scalar_one()
        is_secret = dialog.dialog_type == DialogType.SECRET

        if getattr(participant, "ban_reason", None):
            until = getattr(participant, "banned_until", None)
            now = datetime.now(timezone.utc)
            if until is not None and until <= now:
                participant.ban_reason = None
                participant.banned_until = None
                participant.can_post = True
                await self.db.flush()
            else:
                raise ValueError("member_banned")
        if dialog.dialog_type == DialogType.GROUP and not participant.can_post:
            raise ValueError("member_banned")

        if is_secret and not content_e2e and message_type == MessageType.TEXT:
            raise ValueError("e2e_content_required")
        if not is_secret and message_type == MessageType.TEXT and not content and not media_content:
            raise ValueError("content_required")

        if reply_to_id:
            rep = await self.db.execute(
                select(Message).where(Message.id == reply_to_id, Message.dialog_id == dialog_id)
            )
            if not rep.scalar_one_or_none():
                raise ValueError("reply_not_found")

        media_url = None
        media_type = None
        file_size = None
        if media_content and media_content_type:
            media_url, media_type = StorageService.upload_message_media(
                dialog_id, user.id, media_content, media_content_type, message_type.value
            )
            file_size = len(media_content)

        auto_delete_at = None
        ttl = auto_delete_seconds or dialog.auto_delete_seconds
        if ttl:
            auto_delete_at = datetime.now(timezone.utc) + timedelta(seconds=ttl)

        msg = Message(
            dialog_id=dialog_id,
            sender_id=user.id,
            message_type=message_type,
            encrypted_content=encrypt_message(content) if content and not is_secret else None,
            content_e2e=content_e2e if is_secret else None,
            media_url=media_url,
            media_type=media_type,
            file_name=file_name,
            file_size=file_size,
            reply_to_id=reply_to_id,
            auto_delete_at=auto_delete_at,
        )
        if content and not is_secret:
            msg.search_vector = func.to_tsvector("russian", content)

        self.db.add(msg)
        dialog.last_message_at = datetime.now(timezone.utc)
        await self.db.flush()

        other_ids = await self._other_user_ids(dialog_id, user.id)
        for oid in other_ids:
            await UnreadService.increment(str(oid), str(dialog_id))

        await self.db.commit()

        result = await self.db.execute(
            select(Message)
            .where(Message.id == msg.id)
            .options(selectinload(Message.reactions).selectinload(MessageReaction.user))
        )
        msg = result.scalar_one()

        msg_dict = self._message_to_dict(msg, user, is_secret)
        event = {"type": "message_new", "data": msg_dict}
        await ws_manager.publish_many([str(oid) for oid in other_ids] + [str(user.id)], event)
        return msg_dict

    async def edit_message(self, user: User, message_id: uuid.UUID, content: str | None, content_e2e: str | None) -> dict:
        result = await self.db.execute(
            select(Message, Dialog)
            .join(Dialog, Dialog.id == Message.dialog_id)
            .where(Message.id == message_id)
        )
        row = result.one_or_none()
        if not row:
            raise ValueError("message_not_found")
        msg, dialog = row
        if msg.sender_id != user.id:
            raise ValueError("not_message_owner")
        if msg.is_deleted:
            raise ValueError("message_deleted")

        is_secret = dialog.dialog_type == DialogType.SECRET
        if is_secret:
            msg.content_e2e = content_e2e
        else:
            msg.encrypted_content = encrypt_message(content) if content else None
            msg.content_encrypted = None
            if content:
                msg.search_vector = func.to_tsvector("russian", content)
        msg.is_edited = True
        msg.edited_at = datetime.now(timezone.utc)
        await self.db.commit()

        result = await self.db.execute(
            select(Message)
            .where(Message.id == msg.id)
            .options(selectinload(Message.reactions).selectinload(MessageReaction.user))
        )
        msg = result.scalar_one()

        msg_dict = self._message_to_dict(msg, user, is_secret)
        participant_ids = await self._dialog_user_ids(dialog.id)
        await ws_manager.publish_many(
            [str(uid) for uid in participant_ids],
            {"type": "message_edit", "data": msg_dict},
        )
        return msg_dict

    async def delete_message(self, user: User, message_id: uuid.UUID) -> None:
        result = await self.db.execute(select(Message).where(Message.id == message_id))
        msg = result.scalar_one_or_none()
        if not msg:
            raise ValueError("message_not_found")
        await self._require_participant(msg.dialog_id, user.id)
        if msg.sender_id != user.id:
            raise ValueError("not_message_owner")
        msg.is_deleted = True
        msg.deleted_at = datetime.now(timezone.utc)
        msg.encrypted_content = None
        msg.content_encrypted = None
        msg.content_e2e = None
        msg.search_vector = None
        await self.db.commit()

        participant_ids = await self._dialog_user_ids(msg.dialog_id)
        await ws_manager.publish_many(
            [str(uid) for uid in participant_ids],
            {"type": "message_delete", "data": {"id": str(msg.id), "dialog_id": str(msg.dialog_id)}},
        )

    async def _dialog_user_ids(self, dialog_id: uuid.UUID) -> list[uuid.UUID]:
        result = await self.db.execute(
            select(DialogParticipant.user_id).where(DialogParticipant.dialog_id == dialog_id)
        )
        return [row[0] for row in result.all()]

    async def add_reaction(self, user: User, message_id: uuid.UUID, emoji: str) -> dict:
        result = await self.db.execute(select(Message).where(Message.id == message_id))
        msg = result.scalar_one_or_none()
        if not msg:
            raise ValueError("message_not_found")
        await self._require_participant(msg.dialog_id, user.id)

        existing = await self.db.execute(
            select(MessageReaction).where(
                MessageReaction.message_id == message_id,
                MessageReaction.user_id == user.id,
                MessageReaction.emoji == emoji,
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError("reaction_exists")

        reaction = MessageReaction(message_id=message_id, user_id=user.id, emoji=emoji)
        self.db.add(reaction)
        await self.db.commit()

        data = {"message_id": str(message_id), "emoji": emoji, "user_id": str(user.id), "username": user.username}
        participant_ids = await self._dialog_user_ids(msg.dialog_id)
        await ws_manager.publish_many(
            [str(uid) for uid in participant_ids],
            {"type": "reaction_add", "data": data},
        )
        return data

    async def remove_reaction(self, user: User, message_id: uuid.UUID, emoji: str) -> None:
        result = await self.db.execute(select(Message).where(Message.id == message_id))
        msg = result.scalar_one_or_none()
        if not msg:
            raise ValueError("message_not_found")
        await self._require_participant(msg.dialog_id, user.id)

        await self.db.execute(
            delete(MessageReaction).where(
                MessageReaction.message_id == message_id,
                MessageReaction.user_id == user.id,
                MessageReaction.emoji == emoji,
            )
        )
        await self.db.commit()

        participant_ids = await self._dialog_user_ids(msg.dialog_id)
        await ws_manager.publish_many(
            [str(uid) for uid in participant_ids],
            {"type": "reaction_remove", "data": {"message_id": str(message_id), "emoji": emoji, "user_id": str(user.id)}},
        )

    async def forward_message(self, user: User, message_id: uuid.UUID, target_dialog_ids: list[uuid.UUID]) -> list[dict]:
        result = await self.db.execute(
            select(Message, Dialog).join(Dialog, Dialog.id == Message.dialog_id).where(Message.id == message_id)
        )
        row = result.one_or_none()
        if not row:
            raise ValueError("message_not_found")
        source_msg, source_dialog = row
        await self._require_participant(source_msg.dialog_id, user.id)
        if source_dialog.dialog_type == DialogType.SECRET:
            raise ValueError("cannot_forward_secret")

        content = None
        if source_msg.encrypted_content or source_msg.content_encrypted:
            content = self._decrypt_content(source_msg, False)

        forwarded = []
        for did in target_dialog_ids:
            await self._require_participant(did, user.id)
            msg = Message(
                dialog_id=did,
                sender_id=user.id,
                message_type=source_msg.message_type,
                encrypted_content=encrypt_message(content) if content else None,
                media_url=source_msg.media_url,
                media_type=source_msg.media_type,
                file_name=source_msg.file_name,
                file_size=source_msg.file_size,
                forward_from_message_id=source_msg.id,
                forward_from_dialog_id=source_msg.dialog_id,
            )
            if content:
                msg.search_vector = func.to_tsvector("russian", content)
            self.db.add(msg)
            dialog_res = await self.db.execute(select(Dialog).where(Dialog.id == did))
            dialog = dialog_res.scalar_one()
            dialog.last_message_at = datetime.now(timezone.utc)
            other_ids = await self._other_user_ids(did, user.id)
            for oid in other_ids:
                await UnreadService.increment(str(oid), str(did))
            await self.db.flush()
            msg_dict = self._message_to_dict(msg, user, False)
            forwarded.append(msg_dict)
            await ws_manager.publish_many(
                [str(oid) for oid in other_ids] + [str(user.id)],
                {"type": "message_new", "data": msg_dict},
            )
        await self.db.commit()
        return forwarded

    async def search_messages(self, user: User, query: str, limit: int = 20) -> dict:
        participant_dialogs = await self.db.execute(
            select(DialogParticipant.dialog_id).where(DialogParticipant.user_id == user.id)
        )
        dialog_ids = [row[0] for row in participant_dialogs.all()]
        if not dialog_ids:
            return {"results": [], "total": 0}

        ts_query = func.plainto_tsquery("russian", query)
        result = await self.db.execute(
            select(Message, Dialog)
            .join(Dialog, Dialog.id == Message.dialog_id)
            .where(
                Message.dialog_id.in_(dialog_ids),
                Message.is_deleted == False,
                Dialog.dialog_type == DialogType.DIRECT,
                Message.search_vector.op("@@")(ts_query),
            )
            .order_by(Message.created_at.desc())
            .limit(limit)
        )
        rows = result.all()
        results = []
        for msg, dialog in rows:
            sender_res = await self.db.execute(select(User).where(User.id == msg.sender_id))
            sender = sender_res.scalar_one()
            other = await self._get_other_participant(dialog.id, user.id)
            results.append({
                "message": self._message_to_dict(msg, sender, False),
                "dialog_id": str(dialog.id),
                "other_username": other.username if other else None,
            })
        return {"results": results, "total": len(results)}
