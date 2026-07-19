"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { api, type StickerItem, type StickerPack } from "@/lib/api";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (sticker: StickerItem) => void;
};

export function StickerPicker({ open, onClose, onPick }: Props) {
  const { t } = useTranslation();
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .getInstalledStickers()
      .then((res) => {
        setPacks(res.packs);
        setActiveId(res.packs[0]?.id || null);
      })
      .catch(() => setPacks([]))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const active = packs.find((p) => p.id === activeId) || packs[0];

  return (
    <div className="border border-border rounded-xl bg-background shadow-lg overflow-hidden mb-2">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <p className="text-sm font-medium">{t("marketplace.sticker")}</p>
        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="flex gap-1 px-2 py-2 overflow-x-auto border-b border-border">
        {packs.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActiveId(p.id)}
            className={cn(
              "shrink-0 h-10 w-10 rounded-lg border overflow-hidden",
              active?.id === p.id ? "border-primary ring-1 ring-primary" : "border-border"
            )}
            title={p.name}
          >
            {p.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.cover_image_url} alt={p.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs">🎨</span>
            )}
          </button>
        ))}
        {!loading && packs.length === 0 && (
          <p className="text-xs text-muted-foreground px-2 py-1">{t("marketplace.empty")}</p>
        )}
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 p-3 max-h-52 overflow-y-auto">
        {(active?.stickers || []).map((s) => (
          <button
            key={s.id}
            type="button"
            className="aspect-square rounded-lg hover:bg-muted p-1"
            onClick={() => {
              onPick(s);
              onClose();
            }}
          >
            {s.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.image_url} alt="" className="w-full h-full object-contain" />
            )}
          </button>
        ))}
      </div>
      <div className="px-3 py-2 border-t border-border">
        <Link href="/marketplace">
          <Button variant="outline" size="sm" className="w-full">
            🛍️ {t("marketplace.openMarketplace")}
          </Button>
        </Link>
      </div>
    </div>
  );
}
