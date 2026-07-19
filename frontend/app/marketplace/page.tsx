"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { StickerPackCard } from "@/components/stickers/StickerPackCard";
import { useAuth } from "@/hooks/useAuth";
import { api, type StickerPack } from "@/lib/api";
import { Button, Input } from "@/components/ui";

export default function MarketplacePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [items, setItems] = useState<StickerPack[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [paid, setPaid] = useState("all");
  const [sort, setSort] = useState("popular");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [slots, setSlots] = useState<{ used: number; limit: number | null }>({ used: 0, limit: null });

  const load = async (nextPage = 1, append = false) => {
    try {
      const res = await api.getMarketplace({
        type,
        paid,
        sort,
        search: search.trim() || undefined,
        page: nextPage,
        limit: 12,
      });
      setItems((prev) => (append ? [...prev, ...res.items] : res.items));
      setPage(res.page);
      setHasMore(res.has_more);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      load(1, false);
      api.getInstalledStickers().then((r) => setSlots({ used: r.slots_used, limit: r.slot_limit })).catch(() => {});
    }
  }, [user, type, paid, sort]);

  const buy = async (pack: StickerPack) => {
    setBusyId(pack.id);
    try {
      const updated = await api.buyStickerPack(pack.id);
      setItems((prev) => prev.map((p) => (p.id === pack.id ? { ...p, ...updated, owned: true } : p)));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    } finally {
      setBusyId(null);
    }
  };

  const install = async (pack: StickerPack) => {
    setBusyId(pack.id);
    try {
      const updated = await api.installStickerPack(pack.id);
      setItems((prev) => prev.map((p) => (p.id === pack.id ? { ...p, ...updated, owned: true } : p)));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    } finally {
      setBusyId(null);
    }
  };

  if (loading || !user) {
    return (
      <AppShell>
        <div className="animate-pulse text-muted-foreground">...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-semibold">{t("marketplace.title")}</h1>
        <div className="flex gap-2">
          <Link href="/marketplace/my-packs">
            <Button variant="outline" size="sm">
              {t("marketplace.myPacks")}
            </Button>
          </Link>
          <Link href="/marketplace/create">
            <Button size="sm">{t("marketplace.create")}</Button>
          </Link>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        {slots.limit == null
          ? t("marketplace.slotsUnlimited")
          : t("marketplace.slots", { used: slots.used, limit: slots.limit })}
      </p>

      {message && <p className="text-sm text-destructive mb-3">{message}</p>}

      <div className="flex flex-wrap gap-2 mb-4">
        <Input
          className="max-w-xs"
          placeholder={t("marketplace.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(1, false)}
        />
        <Button variant="outline" onClick={() => load(1, false)}>
          {t("chats.search")}
        </Button>
        <select className="rounded-md border border-input bg-background px-2 py-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">{t("marketplace.typeAll")}</option>
          <option value="official">{t("marketplace.typeOfficial")}</option>
          <option value="user">{t("marketplace.typeUser")}</option>
        </select>
        <select className="rounded-md border border-input bg-background px-2 py-2 text-sm" value={paid} onChange={(e) => setPaid(e.target.value)}>
          <option value="all">{t("marketplace.priceAll")}</option>
          <option value="true">{t("marketplace.pricePaid")}</option>
          <option value="false">{t("marketplace.priceFree")}</option>
        </select>
        <select className="rounded-md border border-input bg-background px-2 py-2 text-sm" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="popular">{t("marketplace.sortPopular")}</option>
          <option value="new">{t("marketplace.sortNew")}</option>
          <option value="price_asc">{t("marketplace.sortPriceAsc")}</option>
          <option value="price_desc">{t("marketplace.sortPriceDesc")}</option>
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map((pack) => (
          <StickerPackCard
            key={pack.id}
            pack={pack}
            busy={busyId === pack.id}
            onBuy={buy}
            onInstall={install}
          />
        ))}
      </div>
      {items.length === 0 && <p className="text-center text-muted-foreground py-10">{t("marketplace.empty")}</p>}
      {hasMore && (
        <div className="flex justify-center mt-6">
          <Button variant="outline" onClick={() => load(page + 1, true)}>
            {t("marketplace.loadMore")}
          </Button>
        </div>
      )}
    </AppShell>
  );
}
