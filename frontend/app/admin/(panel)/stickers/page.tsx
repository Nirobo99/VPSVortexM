"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminApi } from "@/lib/adminApi";
import { Button, Card, CardContent, Input, Label, Textarea } from "@/components/ui";

type Pack = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_official: boolean;
  is_active: boolean;
  cover_image_url: string | null;
  purchase_count: number;
  creator_username?: string | null;
  moderation_status?: string | null;
  rejection_reason?: string | null;
  stickers?: { id: string; image_url: string | null }[];
};

type Stats = {
  top_packs: Pack[];
  total_commission: number;
  total_sales: number;
  active_packs: number;
};

export default function AdminStickersPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"moderation" | "official" | "stats">("moderation");
  const [pending, setPending] = useState<Pack[]>([]);
  const [official, setOfficial] = useState<Pack[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
  const [cover, setCover] = useState<File | null>(null);
  const [stickers, setStickers] = useState<File[]>([]);

  const load = async () => {
    try {
      if (tab === "moderation") setPending(await adminApi.stickerModeration("pending"));
      if (tab === "official") setOfficial(await adminApi.stickerOfficial());
      if (tab === "stats") setStats(await adminApi.stickerStats());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  useEffect(() => {
    load();
  }, [tab]);

  const approve = async (id: string) => {
    await adminApi.approveStickerPack(id);
    load();
  };

  const reject = async (id: string) => {
    await adminApi.rejectStickerPack(id, reason[id] || "Отклонено");
    load();
  };

  const createOfficial = async () => {
    const form = new FormData();
    form.append("name", name);
    form.append("description", description);
    form.append("price", price);
    form.append("is_active", "true");
    if (cover) form.append("cover", cover);
    stickers.forEach((f) => form.append("stickers", f));
    await adminApi.createOfficialStickerPack(form);
    setName("");
    setDescription("");
    setPrice("0");
    setCover(null);
    setStickers([]);
    setTab("official");
    load();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("adminPanel.stickers")}</h1>
      {message && <p className="text-sm text-destructive">{message}</p>}
      <div className="flex gap-2">
        {(["moderation", "official", "stats"] as const).map((k) => (
          <Button key={k} size="sm" variant={tab === k ? "default" : "outline"} onClick={() => setTab(k)}>
            {t(`adminPanel.stickers_${k}`)}
          </Button>
        ))}
      </div>

      {tab === "moderation" && (
        <div className="space-y-3">
          {pending.map((p) => (
            <Card key={p.id}>
              <CardContent className="pt-4 space-y-2">
                <p className="font-medium">
                  {p.name} · @{p.creator_username} · {p.price} VM
                </p>
                <p className="text-sm text-muted-foreground">{p.description}</p>
                <div className="grid grid-cols-6 gap-2">
                  {(p.stickers || []).map((s) =>
                    s.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={s.id} src={s.image_url} alt="" className="aspect-square object-contain border rounded" />
                    ) : null
                  )}
                </div>
                <div className="flex flex-wrap gap-2 items-end">
                  <Button size="sm" onClick={() => approve(p.id)}>
                    {t("admin.resolve")}
                  </Button>
                  <Input
                    className="max-w-xs"
                    placeholder={t("adminPanel.reason")}
                    value={reason[p.id] || ""}
                    onChange={(e) => setReason((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                  <Button size="sm" variant="destructive" onClick={() => reject(p.id)}>
                    {t("admin.reject")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {pending.length === 0 && <p className="text-muted-foreground">{t("marketplace.empty")}</p>}
        </div>
      )}

      {tab === "official" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-3 max-w-lg">
              <div>
                <Label>{t("marketplace.name")}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>{t("marketplace.description")}</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
              </div>
              <div>
                <Label>{t("marketplace.priceVm")}</Label>
                <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div>
                <Label>{t("marketplace.cover")}</Label>
                <Input type="file" accept="image/png,image/webp" onChange={(e) => setCover(e.target.files?.[0] || null)} />
              </div>
              <div>
                <Label>{t("marketplace.stickers")}</Label>
                <Input
                  type="file"
                  accept="image/png,image/webp"
                  multiple
                  onChange={(e) => setStickers(Array.from(e.target.files || []))}
                />
                <p className="text-xs text-muted-foreground mt-1">{stickers.length}/30</p>
              </div>
              <Button onClick={createOfficial} disabled={!name.trim() || stickers.length < 5}>
                {t("marketplace.create")}
              </Button>
            </CardContent>
          </Card>
          <div className="space-y-2">
            {official.map((p) => (
              <Card key={p.id}>
                <CardContent className="py-3 flex justify-between items-center gap-2">
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.price} VM · {p.is_active ? t("adminPanel.active") : t("adminPanel.inactive")} · {p.purchase_count}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      await adminApi.deleteOfficialStickerPack(p.id);
                      load();
                    }}
                  >
                    {t("marketplace.delete")}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === "stats" && stats && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">Комиссия</p>
                <p className="text-2xl font-bold">{stats.total_commission} VM</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">Продажи</p>
                <p className="text-2xl font-bold">{stats.total_sales}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">Активные паки</p>
                <p className="text-2xl font-bold">{stats.active_packs}</p>
              </CardContent>
            </Card>
          </div>
          <div className="space-y-2">
            {stats.top_packs.map((p, i) => (
              <Card key={p.id}>
                <CardContent className="py-2 flex justify-between text-sm">
                  <span>
                    #{i + 1} {p.name}
                  </span>
                  <span>{p.purchase_count} · {p.price} VM</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
