"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

const EMOJIS = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😜", "🤔", "😎",
  "😢", "😭", "😡", "🤯", "😴", "🤗", "🫡", "🤝", "👍", "👎",
  "👏", "🙏", "🔥", "❤️", "💔", "✨", "⭐", "🎉", "💯", "🚀",
  "💬", "📌", "✅", "❌", "⚠️", "💡", "🎁", "🏆", "🎵", "📸",
];

interface EmojiPickerButtonProps {
  onPick: (emoji: string) => void;
  title?: string;
  className?: string;
}

export function EmojiPickerButton({ onPick, title = "Emoji", className }: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className={`relative ${className || ""}`} ref={ref}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="px-2 h-10 shrink-0"
        title={title}
        onClick={() => setOpen((v) => !v)}
      >
        😊
      </Button>
      {open && (
        <div className="absolute bottom-full mb-1 left-0 z-50 w-56 rounded-lg border border-border bg-background p-2 shadow-lg grid grid-cols-8 gap-1">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="h-8 w-8 rounded hover:bg-muted text-lg leading-none"
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
