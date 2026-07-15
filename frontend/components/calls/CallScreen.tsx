"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  createLocalTracks,
  LocalTrack,
  RemoteParticipant,
  RemoteTrack,
} from "livekit-client";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Button } from "@/components/ui";

const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || "ws://localhost:7880";

interface CallScreenProps {
  callId: string;
}

export function CallScreen({ callId }: CallScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [connected, setConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingBanner, setRecordingBanner] = useState(false);
  const [callType, setCallType] = useState<"audio" | "video">("video");
  const [isInitiator, setIsInitiator] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteContainerRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef<number>(0);
  const localTracksRef = useRef<LocalTrack[]>([]);
  const roomRef = useRef<Room | null>(null);

  const handleLeave = async () => {
    try {
      if (isRecording && isInitiator && mediaRecorderRef.current) {
        const recorder = mediaRecorderRef.current;
        const duration = Math.round((Date.now() - recordingStartRef.current) / 1000);
        if (recorder.state !== "inactive") {
          await new Promise<void>((resolve) => {
            recorder.onstop = () => resolve();
            recorder.stop();
          });
          const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
          const file = new File([blob], `recording-${callId}.webm`, { type: "video/webm" });
          await api.stopRecording(callId, file, duration);
        }
      }
      await api.leaveCall(callId);
    } catch {
      /* ignore */
    }
    roomRef.current?.disconnect();
    router.push("/messages?tab=chats");
  };

  useWebSocket((event) => {
    if (event.type === "call_recording_started") setRecordingBanner(true);
    if (event.type === "call_recording_stopped") {
      setRecordingBanner(false);
      setIsRecording(false);
    }
    if (event.type === "call_ended") handleLeave();
  });

  const attachRemoteTrack = useCallback((track: RemoteTrack, participant: RemoteParticipant) => {
    if (!remoteContainerRef.current) return;
    const el = track.attach();
    let maskFace = false;
    try {
      const meta = participant.metadata ? JSON.parse(participant.metadata) : {};
      maskFace = meta.mask_face === true;
    } catch {
      /* ignore */
    }
    if (track.kind === Track.Kind.Video && maskFace) {
      (el as HTMLVideoElement).style.filter = "blur(12px)";
    }
    el.className = "w-full h-48 object-cover rounded-lg bg-muted";
    remoteContainerRef.current.appendChild(el);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function connect() {
      const join = await api.joinCall(callId);
      setCallType(join.call.call_type as "audio" | "video");
      setIsInitiator(join.call.initiator_id === user?.id);
      setIsRecording(join.call.is_recording);
      setRecordingBanner(join.call.is_recording);

      const me = join.call.participants.find((p) => p.user_id === user?.id);
      const maskFace = me?.mask_face ?? false;

      const lkRoom = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = lkRoom;
      const audioOnly = join.call.call_type === "audio";

      lkRoom.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
        attachRemoteTrack(track, participant);
      });
      lkRoom.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach();
      });
      lkRoom.on(RoomEvent.ConnectionStateChanged, (state) => {
        setConnected(state === ConnectionState.Connected);
      });

      await lkRoom.connect(join.livekit_url || LIVEKIT_URL, join.token);

      const tracks = await createLocalTracks({ audio: true, video: !audioOnly });
      localTracksRef.current = tracks;

      for (const track of tracks) {
        await lkRoom.localParticipant.publishTrack(track);
        if (track.kind === Track.Kind.Video && localVideoRef.current) {
          track.attach(localVideoRef.current);
          if (maskFace) localVideoRef.current.style.filter = "blur(12px)";
        }
      }

      if (mounted) setRoom(lkRoom);
    }

    connect().catch(() => router.push("/messages?tab=chats"));

    return () => {
      mounted = false;
      localTracksRef.current.forEach((tr) => tr.stop());
      roomRef.current?.disconnect();
    };
  }, [attachRemoteTrack, callId, router, user?.id]);

  const toggleMute = async () => {
    if (!room) return;
    const enabled = room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(!enabled);
    setIsMuted(enabled);
  };

  const toggleVideo = async () => {
    if (!room) return;
    const enabled = room.localParticipant.isCameraEnabled;
    await room.localParticipant.setCameraEnabled(!enabled);
    setIsVideoOff(enabled);
  };

  const startRecording = async () => {
    if (!isInitiator) return;
    await api.startRecording(callId);
    setIsRecording(true);
    setRecordingBanner(true);

    const stream = localVideoRef.current?.srcObject as MediaStream | null;
    if (stream && typeof MediaRecorder !== "undefined") {
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      recordingStartRef.current = Date.now();
    }
  };

  const stopRecording = async () => {
    const recorder = mediaRecorderRef.current;
    const duration = Math.round((Date.now() - recordingStartRef.current) / 1000);
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
      const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
      const file = new File([blob], `recording-${callId}.webm`, { type: "video/webm" });
      await api.stopRecording(callId, file, duration);
    } else {
      await api.stopRecording(callId, undefined, duration);
    }
    setIsRecording(false);
    setRecordingBanner(false);
    mediaRecorderRef.current = null;
  };

  return (
    <div className="fixed inset-0 z-40 bg-background flex flex-col">
      {recordingBanner && (
        <div className="bg-destructive text-destructive-foreground text-center py-2 text-sm font-medium">
          ⏺ {t("calls.recordingActive")}
        </div>
      )}

      <div className="flex-1 p-4 grid gap-3 sm:grid-cols-2 overflow-auto">
        <div className="relative bg-muted rounded-lg overflow-hidden min-h-[200px]">
          {callType === "video" ? (
            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover mirror" />
          ) : (
            <div className="flex items-center justify-center h-full text-4xl">🎤</div>
          )}
          <span className="absolute bottom-2 left-2 text-xs bg-black/50 text-white px-2 py-1 rounded">
            {t("calls.you")} {isMuted && "🔇"}
          </span>
        </div>
        <div ref={remoteContainerRef} className="grid gap-2 content-start" />
      </div>

      <div className="p-4 border-t border-border flex flex-wrap items-center justify-center gap-3">
        <Button variant={isMuted ? "destructive" : "outline"} onClick={toggleMute}>
          {isMuted ? "🔇" : "🎤"}
        </Button>
        {callType === "video" && (
          <Button variant={isVideoOff ? "destructive" : "outline"} onClick={toggleVideo}>
            {isVideoOff ? "📷" : "📹"}
          </Button>
        )}
        {isInitiator && (
          <Button variant={isRecording ? "destructive" : "outline"} onClick={isRecording ? stopRecording : startRecording}>
            {isRecording ? "⏹" : "⏺"} {t("calls.record")}
          </Button>
        )}
        <Button variant="destructive" onClick={handleLeave}>
          {t("calls.endCall")}
        </Button>
        <span className="text-xs text-muted-foreground w-full text-center">
          {connected ? t("calls.connected") : t("calls.connecting")}
        </span>
      </div>

      <style jsx global>{`
        .mirror {
          transform: scaleX(-1);
        }
      `}</style>
    </div>
  );
}
