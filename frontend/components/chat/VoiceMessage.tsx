"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDuration } from "@/lib/recordMedia";

type Props = {
  url: string;
  mine?: boolean;
};

export function VoiceMessage({ url, mine }: Props) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onTime = () => setCurrent(audio.currentTime);
    const onEnd = () => {
      setPlaying(false);
      setCurrent(0);
    };
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
    };
  }, [url]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  const progress = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div className={`flex items-center gap-2 min-w-[180px] max-w-[240px] mb-1 ${mine ? "text-primary-foreground" : ""}`}>
      <audio ref={audioRef} src={url} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={toggle}
        className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-sm ${
          mine ? "bg-primary-foreground/20 hover:bg-primary-foreground/30" : "bg-primary/15 hover:bg-primary/25"
        }`}
        aria-label={playing ? t("chats.pauseVoice") : t("chats.playVoice")}
      >
        {playing ? "⏸" : "▶"}
      </button>
      <div className="flex-1 min-w-0 space-y-1">
        <div className={`h-1.5 rounded-full overflow-hidden ${mine ? "bg-primary-foreground/25" : "bg-muted-foreground/25"}`}>
          <div
            className={`h-full rounded-full transition-all ${mine ? "bg-primary-foreground" : "bg-primary"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-[10px] opacity-70 tabular-nums">
          {formatDuration(Math.floor(current))} / {duration > 0 ? formatDuration(Math.floor(duration)) : "0:00"}
        </p>
      </div>
      <span className="text-base shrink-0" aria-hidden>
        🎤
      </span>
    </div>
  );
}
