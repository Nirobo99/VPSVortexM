"use client";

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type Props = {
  url: string;
};

export function VideoNoteMessage({ url }: Props) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      video.pause();
      setPlaying(false);
    } else {
      void video.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  return (
    <div className="relative mb-1">
      <button
        type="button"
        onClick={toggle}
        className="relative h-40 w-40 rounded-full overflow-hidden bg-black/80 ring-2 ring-primary/40 focus:outline-none focus:ring-primary"
        aria-label={playing ? t("chats.pauseVideoNote") : t("chats.playVideoNote")}
      >
        <video
          ref={videoRef}
          src={url}
          className="h-full w-full object-cover"
          playsInline
          preload="metadata"
          onEnded={() => setPlaying(false)}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
        />
        {!playing && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-3xl text-white">
            ▶
          </span>
        )}
      </button>
    </div>
  );
}
