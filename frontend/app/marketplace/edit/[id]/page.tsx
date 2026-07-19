"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { api, type StickerPack } from "@/lib/api";
import { Button, Card, CardContent, Input, Label, Textarea } from "@/components/ui";

export default function EditStickerPackPage() {
  const { t } = useTranslation();
  const params = useParams();
  const packId = params.id as string;
  const router = useRouter();
  const { user, loading } = useAuth();
  const [pack, setPack] = useState<StickerPack | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("50");
  const [cover, setCover] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !packId) return;
    api
      .getMyCreatedPacks()
      .then((list) => {
        const found = list.find((p) => p.id === packId) || null;
        if (!found) {
          router.push("/marketplace/my-packs");
          return;
        }
        setPack(found);
        setName(found.name);
        setDescription(found.description || "");
        setPrice(String(found.price || 10));
      })
      .catch(() => router.push("/marketplace/my-packs"));
  }, [user, packId, router]);

  const save = async (submit: boolean) => {
    setSaving(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("name", name.trim());
      form.append("description", description);
      form.append("price", String(Number(price) || 10));
      form.append("submit", submit ? "true" : "false");
      if (cover) form.append("cover", cover);
      const updated = await api.updateStickerPack(packId, form);
      setPack(updated);
      if (submit) router.push("/marketplace/my-packs");
      else setMessage(t("marketplace.save"));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user || !pack) {
    return (
      <AppShell>
        <div className="animate-pulse">...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{t("marketplace.edit")}</h1>
          <Link href="/marketplace/my-packs">
            <Button variant="ghost" size="sm">
              ←
            </Button>
          </Link>
        </div>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div>
              <Label>{t("marketplace.name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>{t("marketplace.description")}</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <div>
              <Label>{t("marketplace.priceVm")}</Label>
              <Input type="number" min={10} max={10000} value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div>
              <Label>{t("marketplace.cover")}</Label>
              <Input type="file" accept="image/png,image/webp" onChange={(e) => setCover(e.target.files?.[0] || null)} />
            </div>
            <div className="grid grid-cols-5 gap-2">
              {(pack.stickers || pack.preview_stickers || []).map((s) =>
                s.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={s.id} src={s.image_url} alt="" className="aspect-square object-contain rounded border" />
                ) : null
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => save(true)} disabled={saving || !name.trim()}>
                {t("marketplace.submit")}
              </Button>
              <Button variant="outline" onClick={() => save(false)} disabled={saving || !name.trim()}>
                {t("marketplace.save")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
