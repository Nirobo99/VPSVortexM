"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import type { StickerPack } from "@/lib/api";
import { Button, Card, CardContent } from "@/components/ui";
import { cn } from "@/lib/utils";

type Props = {
  pack: StickerPack;
  onBuy?: (pack: StickerPack) => void;
  onInstall?: (pack: StickerPack) => void;
  busy?: boolean;
};

export function StickerPackCard({ pack, onBuy, onInstall, busy }: Props) {
  const { t } = useTranslation();
  const free = !pack.price || pack.price <= 0;

  return (
    <Card className="overflow-hidden group hover:border-primary/50 transition-all hover:shadow-md">
      <div className="aspect-square bg-muted overflow-hidden">
        {pack.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pack.cover_image_url}
            alt={pack.name}
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl">🎨</div>
        )}
      </div>
      <CardContent className="p-3 space-y-2">
        <div className="min-w-0">
          <p className="font-medium truncate flex items-center gap-1">
            <span className="truncate">{pack.name}</span>
            {pack.is_official && (
              <span className="text-[10px] px-1 rounded bg-primary/15 text-primary shrink-0">
                {t("marketplace.official")}
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            @{pack.creator_username || "VortexM"} · {pack.purchase_count} {t("marketplace.purchases")}
          </p>
        </div>
        {pack.owned ? (
          <Button size="sm" className="w-full" variant="secondary" disabled>
            {t("marketplace.installed")}
          </Button>
        ) : free ? (
          <Button size="sm" className="w-full" disabled={busy} onClick={() => onInstall?.(pack)}>
            {t("marketplace.install")}
          </Button>
        ) : (
          <Button size="sm" className="w-full" disabled={busy} onClick={() => onBuy?.(pack)}>
            {t("marketplace.buy", { price: pack.price })}
          </Button>
        )}
        <Link
          href={`/marketplace?pack=${pack.id}`}
          className={cn("block text-center text-xs text-muted-foreground hover:text-primary")}
        >
          {pack.sticker_count} {t("marketplace.stickers").toLowerCase()}
        </Link>
      </CardContent>
    </Card>
  );
}
