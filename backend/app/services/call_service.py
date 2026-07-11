import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.calls import Call, CallParticipant, CallRecording, CallStatus, CallType
from app.models.messaging import DialogParticipant
from app.models.user import User
from app.services.livekit_service import LiveKitService
from app.services.messaging_service import MessagingService
from app.services.storage_service import StorageService
from app.services.ws_manager import ws_manager


class CallService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.messaging = MessagingService(db)

    async def _dialog_user_ids(self, dialog_id: uuid.UUID) -> list[uuid.UUID]:
        result = await self.db.execute(
            select(DialogParticipant.user_id).where(DialogParticipant.dialog_id == dialog_id)
        )
        return [row[0] for row in result.all()]

    def _call_to_dict(self, call: Call, users: dict[uuid.UUID, User]) -> dict:
        participants = []
        for p in call.participants:
            u = users.get(p.user_id)
            participants.append({
                "user_id": str(p.user_id),
                "username": u.username if u else "",
                "display_name": u.display_name if u else None,
                "avatar_url": StorageService.generate_presigned_url(u.avatar_url) if u else None,
                "mask_face": p.mask_face,
                "mask_voice": p.mask_voice,
                "joined_at": p.joined_at.isoformat() if p.joined_at else None,
            })
        return {
            "id": str(call.id),
            "dialog_id": str(call.dialog_id),
            "room_name": call.room_name,
            "call_type": call.call_type.value,
            "status": call.status.value,
            "initiator_id": str(call.initiator_id),
            "is_group": call.is_group,
            "max_participants": call.max_participants,
            "is_recording": call.is_recording,
            "recording_started_at": call.recording_started_at.isoformat() if call.recording_started_at else None,
            "started_at": call.started_at.isoformat() if call.started_at else None,
            "ended_at": call.ended_at.isoformat() if call.ended_at else None,
            "created_at": call.created_at.isoformat(),
            "participants": participants,
        }

    async def _load_users(self, call: Call) -> dict[uuid.UUID, User]:
        user_ids = [p.user_id for p in call.participants] + [call.initiator_id]
        result = await self.db.execute(select(User).where(User.id.in_(user_ids)))
        return {u.id: u for u in result.scalars().all()}

    async def create_call(
        self, user: User, dialog_id: uuid.UUID, call_type: CallType, is_group: bool = False
    ) -> dict:
        await self.messaging._require_participant(dialog_id, user.id)

        active = await self.db.execute(
            select(Call).where(
                Call.dialog_id == dialog_id,
                Call.status.in_([CallStatus.RINGING, CallStatus.ACTIVE]),
            )
        )
        if active.scalar_one_or_none():
            raise ValueError("call_already_active")

        call_id = uuid.uuid4()
        room_name = LiveKitService.room_name_for_call(call_id)
        call = Call(
            id=call_id,
            dialog_id=dialog_id,
            room_name=room_name,
            call_type=call_type,
            status=CallStatus.RINGING,
            initiator_id=user.id,
            is_group=is_group,
        )
        self.db.add(call)

        user_ids = await self._dialog_user_ids(dialog_id)
        for uid in user_ids:
            u_res = await self.db.execute(select(User).where(User.id == uid))
            u = u_res.scalar_one()
            self.db.add(
                CallParticipant(
                    call_id=call.id,
                    user_id=uid,
                    mask_face=u.anonymous_mask_face or u.is_anonymous,
                    mask_voice=u.anonymous_mask_voice or u.is_anonymous,
                )
            )

        await self.db.commit()
        await self.db.refresh(call, ["participants"])
        users = await self._load_users(call)
        data = self._call_to_dict(call, users)

        other_ids = [uid for uid in user_ids if uid != user.id]
        await ws_manager.publish_many(
            [str(uid) for uid in other_ids],
            {"type": "call_incoming", "data": data},
        )
        return data

    async def get_call(self, user: User, call_id: uuid.UUID) -> dict:
        call = await self._get_call_for_user(user, call_id)
        users = await self._load_users(call)
        return self._call_to_dict(call, users)

    async def _get_call_for_user(self, user: User, call_id: uuid.UUID) -> Call:
        result = await self.db.execute(
            select(Call)
            .where(Call.id == call_id)
            .options(selectinload(Call.participants))
        )
        call = result.scalar_one_or_none()
        if not call:
            raise ValueError("call_not_found")
        participant_ids = {p.user_id for p in call.participants}
        if user.id not in participant_ids:
            raise ValueError("call_not_found")
        return call

    async def join_call(self, user: User, call_id: uuid.UUID) -> dict:
        call = await self._get_call_for_user(user, call_id)
        if call.status == CallStatus.ENDED:
            raise ValueError("call_ended")

        cp = next((p for p in call.participants if p.user_id == user.id), None)
        if cp:
            cp.joined_at = datetime.now(timezone.utc)
            cp.left_at = None

        if call.status == CallStatus.RINGING and user.id != call.initiator_id:
            call.status = CallStatus.ACTIVE
            call.started_at = datetime.now(timezone.utc)
        elif call.status == CallStatus.RINGING and user.id == call.initiator_id:
            call.status = CallStatus.ACTIVE
            call.started_at = datetime.now(timezone.utc)

        await self.db.commit()

        metadata = {
            "mask_face": cp.mask_face if cp else False,
            "mask_voice": cp.mask_voice if cp else False,
            "call_type": call.call_type.value,
        }
        token = LiveKitService.create_token(
            call.room_name,
            str(user.id),
            user.display_name or user.username,
            metadata=metadata,
            room_admin=user.id == call.initiator_id,
        )

        users = await self._load_users(call)
        data = self._call_to_dict(call, users)
        await ws_manager.publish_many(
            [str(p.user_id) for p in call.participants if p.user_id != user.id],
            {"type": "call_joined", "data": {"call_id": str(call.id), "user_id": str(user.id)}},
        )

        return {
            "token": token,
            "livekit_url": LiveKitService.get_ws_url(),
            "room_name": call.room_name,
            "call": data,
        }

    async def decline_call(self, user: User, call_id: uuid.UUID) -> None:
        call = await self._get_call_for_user(user, call_id)
        if call.status != CallStatus.RINGING:
            raise ValueError("call_not_ringing")
        if user.id == call.initiator_id:
            raise ValueError("initiator_cannot_decline")

        call.status = CallStatus.ENDED
        call.ended_at = datetime.now(timezone.utc)
        await self.db.commit()

        await ws_manager.publish_many(
            [str(call.initiator_id)],
            {"type": "call_declined", "data": {"call_id": str(call.id), "user_id": str(user.id)}},
        )

    async def leave_call(self, user: User, call_id: uuid.UUID) -> None:
        call = await self._get_call_for_user(user, call_id)
        cp = next((p for p in call.participants if p.user_id == user.id), None)
        if cp:
            cp.left_at = datetime.now(timezone.utc)

        active_count = sum(
            1 for p in call.participants if p.user_id != user.id and p.joined_at and not p.left_at
        )
        if active_count == 0 or call.initiator_id == user.id:
            call.status = CallStatus.ENDED
            call.ended_at = datetime.now(timezone.utc)
            if call.is_recording:
                call.is_recording = False

        await self.db.commit()

        other_ids = [p.user_id for p in call.participants if p.user_id != user.id]
        await ws_manager.publish_many(
            [str(uid) for uid in other_ids],
            {"type": "call_ended", "data": {"call_id": str(call.id), "user_id": str(user.id)}},
        )

    async def start_recording(self, user: User, call_id: uuid.UUID) -> dict:
        call = await self._get_call_for_user(user, call_id)
        if call.status != CallStatus.ACTIVE:
            raise ValueError("call_not_active")
        if user.id != call.initiator_id:
            raise ValueError("only_initiator_can_record")
        if call.is_recording:
            raise ValueError("already_recording")

        call.is_recording = True
        call.recording_started_at = datetime.now(timezone.utc)
        recording = CallRecording(call_id=call.id, uploaded_by_id=user.id)
        self.db.add(recording)
        await self.db.commit()
        await self.db.refresh(recording)

        await ws_manager.publish_many(
            [str(p.user_id) for p in call.participants],
            {
                "type": "call_recording_started",
                "data": {
                    "call_id": str(call.id),
                    "started_by": str(user.id),
                    "message": "recording_started",
                },
            },
        )

        return {
            "id": str(recording.id),
            "call_id": str(call.id),
            "started_at": recording.started_at.isoformat(),
        }

    async def stop_recording(
        self,
        user: User,
        call_id: uuid.UUID,
        content: bytes | None = None,
        content_type: str | None = None,
        duration_seconds: int | None = None,
    ) -> dict:
        call = await self._get_call_for_user(user, call_id)
        if not call.is_recording:
            raise ValueError("not_recording")
        if user.id != call.initiator_id:
            raise ValueError("only_initiator_can_record")

        result = await self.db.execute(
            select(CallRecording)
            .where(CallRecording.call_id == call.id, CallRecording.ended_at.is_(None))
            .order_by(CallRecording.started_at.desc())
        )
        recording = result.scalar_one_or_none()
        if not recording:
            raise ValueError("recording_not_found")

        storage_url = None
        file_size = None
        if content and content_type:
            key = f"recordings/{call.id}/{uuid.uuid4()}.webm"
            storage_url = StorageService.upload_file(content, key, content_type)
            file_size = len(content)

        recording.storage_url = storage_url
        recording.file_size = file_size
        recording.duration_seconds = duration_seconds
        recording.ended_at = datetime.now(timezone.utc)
        recording.uploaded_by_id = user.id
        call.is_recording = False
        await self.db.commit()

        await ws_manager.publish_many(
            [str(p.user_id) for p in call.participants],
            {
                "type": "call_recording_stopped",
                "data": {
                    "call_id": str(call.id),
                    "storage_url": StorageService.generate_presigned_url(storage_url),
                    "duration_seconds": duration_seconds,
                },
            },
        )

        return {
            "id": str(recording.id),
            "call_id": str(call.id),
            "storage_url": StorageService.generate_presigned_url(storage_url),
            "file_size": file_size,
            "duration_seconds": duration_seconds,
            "started_at": recording.started_at.isoformat(),
            "ended_at": recording.ended_at.isoformat() if recording.ended_at else None,
        }

    async def get_active_call_for_dialog(self, user: User, dialog_id: uuid.UUID) -> dict | None:
        await self.messaging._require_participant(dialog_id, user.id)
        result = await self.db.execute(
            select(Call)
            .where(
                Call.dialog_id == dialog_id,
                Call.status.in_([CallStatus.RINGING, CallStatus.ACTIVE]),
            )
            .options(selectinload(Call.participants))
        )
        call = result.scalar_one_or_none()
        if not call:
            return None
        users = await self._load_users(call)
        return self._call_to_dict(call, users)
