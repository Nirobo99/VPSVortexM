"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  url: string | null | undefined;
  alt?: string;
  className?: string;
};

export function StickerMessage({ url, alt = "sticker", className }: Props) {
  const [open, setOpen] = useState(false);
  if (!url) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn("block", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          className="w-[120px] h-[120px] sm:w-[160px] sm:h-[160px] md:w-[200px] md:h-[200px] object-contain"
        />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
          role="dialog"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={alt} className="max-w-[400px] max-h-[400px] w-full object-contain" />
        </div>
      )}
    </>
  );
}
