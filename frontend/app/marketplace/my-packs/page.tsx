"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { api, type StickerPack } from "@/lib/api";
import { Button, Card, CardContent } from "@/components/ui";

function statusLabel(t: (k: string) => string, status?: string | null) {
  if (status === "draft") return t("marketplace.statusDraft");
  if (status === "pending") return t("marketplace.statusPending");
  if (status === "approved") return t("marketplace.statusApproved");
  if (status === "rejected") return t("marketplace.statusRejected");
  return status || "—";
}

export default function MyPacksPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = () => api.getMyCreatedPacks().then(setPacks).catch(() => setPacks([]));

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (user) load();
  }, [user]);

  const remove = async (id: string) => {
    try {
      await api.deleteStickerPack(id);
      load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  if (loading || !user) {
    return (
      <AppShell>
        <div className="animate-pulse">...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4 gap-2">
        <h1 className="text-2xl font-semibold">{t("marketplace.myPacks")}</h1>
        <div className="flex gap-2">
          <Link href="/marketplace">
            <Button variant="outline" size="sm">
              ←
            </Button>
          </Link>
          <Link href="/marketplace/create">
            <Button size="sm">{t("marketplace.create")}</Button>
          </Link>
        </div>
      </div>
      {message && <p className="text-sm text-destructive mb-3">{message}</p>}
      <div className="space-y-3">
        {packs.map((p) => (
          <Card key={p.id}>
            <CardContent className="py-3 flex gap-3 items-center">
              <div className="h-14 w-14 rounded-lg bg-muted overflow-hidden shrink-0">
                {p.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.cover_image_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">🎨</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {statusLabel(t, p.moderation_status)} · {p.price} VM · {p.purchase_count} {t("marketplace.purchases")}
                </p>
                {p.rejection_reason && (
                  <p className="text-xs text-destructive mt-1">{p.rejection_reason}</p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                {p.moderation_status !== "approved" && (
                  <Link href={`/marketplace/edit/${p.id}`}>
                    <Button size="sm" variant="outline">
                      {t("marketplace.edit")}
                    </Button>
                  </Link>
                )}
                <Button size="sm" variant="destructive" onClick={() => remove(p.id)}>
                  {t("marketplace.delete")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {packs.length === 0 && <p className="text-center text-muted-foreground py-8">{t("marketplace.empty")}</p>}
      </div>
    </AppShell>
  );
}
