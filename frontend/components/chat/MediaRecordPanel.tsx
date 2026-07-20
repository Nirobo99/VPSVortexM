"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import {
  VOICE_MAX_SECONDS,
  VIDEO_NOTE_MAX_SECONDS,
  blobToFile,
  formatDuration,
  pickVideoNoteMime,
  pickVoiceMime,
} from "@/lib/recordMedia";

type RecordMode = "voice" | "video_note";

type Props = {
  mode: RecordMode;
  onSend: (file: File, messageType: RecordMode) => Promise<void>;
  onClose: () => void;
  disabled?: boolean;
};

export function MediaRecordPanel({ mode, onSend, onClose, disabled }: Props) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<number | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const mimeRef = useRef<string>("");

  const maxSeconds = mode === "voice" ? VOICE_MAX_SECONDS : VIDEO_NOTE_MAX_SECONDS;

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  };

  const cleanupTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopRecording = () => {
    cleanupTimer();
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    } else {
      cleanupStream();
    }
    setRecording(false);
  };

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      setError(null);
      setSeconds(0);
      blobRef.current = null;
      chunksRef.current = [];

      try {
        const constraints: MediaStreamConstraints =
          mode === "voice"
            ? { audio: true }
            : { audio: true, video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } } };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;

        if (mode === "video_note" && videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }

        const mime = mode === "voice" ? pickVoiceMime() : pickVideoNoteMime();
        mimeRef.current = mime;
        const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        recorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          cleanupStream();
          const blob = new Blob(chunksRef.current, { type: mimeRef.current || (mode === "voice" ? "audio/webm" : "video/webm") });
          blobRef.current = blob;
          setPreviewUrl(URL.createObjectURL(blob));
        };

        recorder.start(250);
        setRecording(true);
        timerRef.current = window.setInterval(() => {
          setSeconds((s) => {
            if (s + 1 >= maxSeconds) {
              stopRecording();
              return maxSeconds;
            }
            return s + 1;
          });
        }, 1000);
      } catch {
        setError(
          mode === "voice" ? t("chats.micPermissionDenied") : t("chats.cameraPermissionDenied")
        );
      }
    };

    void start();

    return () => {
      cancelled = true;
      cleanupTimer();
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
      cleanupStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleSend = async () => {
    const blob = blobRef.current;
    if (!blob || sending || disabled) return;
    setSending(true);
    try {
      const ext = mode === "voice" ? "webm" : "webm";
      const type = mimeRef.current || blob.type || (mode === "voice" ? "audio/webm" : "video/webm");
      const file = blobToFile(blob, `${mode}-${Date.now()}.${ext}`, type);
      await onSend(file, mode);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.error"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/60" aria-label={t("profile.cancel")} onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-background p-4 shadow-xl space-y-4">
        <h3 className="text-lg font-semibold text-center">
          {mode === "voice" ? t("chats.recordVoice") : t("chats.recordVideoNote")}
        </h3>

        {mode === "video_note" && (
          <div className="flex justify-center">
            <div className="h-44 w-44 rounded-full overflow-hidden bg-black ring-2 ring-primary/40">
              {previewUrl ? (
                <video src={previewUrl} className="h-full w-full object-cover" controls playsInline />
              ) : (
                <video ref={videoRef} className="h-full w-full object-cover" style={{ transform: "scaleX(-1)" }} playsInline muted />
              )}
            </div>
          </div>
        )}

        {mode === "voice" && previewUrl && (
          <audio src={previewUrl} controls className="w-full" />
        )}

        <p className="text-center text-sm tabular-nums">
          {recording ? t("chats.recording") : t("chats.recordReady")}: {formatDuration(seconds)}
          {recording && seconds >= maxSeconds && (
            <span className="block text-xs text-amber-500 mt-1">{t("chats.maxDurationReached")}</span>
          )}
        </p>

        {error && <p className="text-sm text-destructive text-center">{error}</p>}

        <div className="flex gap-2 justify-center flex-wrap">
          {recording ? (
            <Button type="button" variant="destructive" onClick={stopRecording}>
              {t("chats.stopRecording")}
            </Button>
          ) : previewUrl ? (
            <>
              <Button type="button" variant="outline" onClick={onClose} disabled={sending}>
                {t("profile.cancel")}
              </Button>
              <Button type="button" onClick={handleSend} disabled={sending || disabled}>
                {sending ? "…" : t("chats.sendRecording")}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={onClose}>
              {t("profile.cancel")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
