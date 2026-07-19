"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { Button, Card, CardContent, Input, Label, Textarea } from "@/components/ui";

export default function CreateStickerPackPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("50");
  const [cover, setCover] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [stickers, setStickers] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview);
      previews.forEach((p) => URL.revokeObjectURL(p));
    };
  }, [coverPreview, previews]);

  const onStickers = (files: FileList | null) => {
    if (!files) return;
    const next = [...stickers, ...Array.from(files)].slice(0, 30);
    setStickers(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const submit = async (asDraft: boolean) => {
    setSaving(true);
    setMessage(null);
    try {
      if (stickers.length < 5) {
        setMessage(t("marketplace.stickersHint"));
        return;
      }
      const form = new FormData();
      form.append("name", name.trim());
      form.append("description", description);
      form.append("price", String(Number(price) || 10));
      form.append("submit", asDraft ? "false" : "true");
      if (cover) form.append("cover", cover);
      stickers.forEach((f) => form.append("stickers", f));
      await api.createStickerPack(form);
      router.push("/marketplace/my-packs");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    } finally {
      setSaving(false);
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
      <div className="max-w-xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{t("marketplace.create")}</h1>
          <Link href="/marketplace">
            <Button variant="ghost" size="sm">
              ←
            </Button>
          </Link>
        </div>
        {message && <p className="text-sm text-destructive">{message}</p>}
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
              <Input
                type="file"
                accept="image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setCover(file);
                  if (coverPreview) URL.revokeObjectURL(coverPreview);
                  setCoverPreview(file ? URL.createObjectURL(file) : null);
                }}
              />
              {coverPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverPreview} alt="" className="mt-2 h-24 w-24 object-cover rounded-lg" />
              )}
            </div>
            <div>
              <Label>{t("marketplace.stickers")}</Label>
              <p className="text-xs text-muted-foreground mb-1">{t("marketplace.stickersHint")}</p>
              <Input type="file" accept="image/png,image/webp" multiple onChange={(e) => onStickers(e.target.files)} />
              <p className="text-xs mt-1">{stickers.length}/30</p>
              <div className="grid grid-cols-5 gap-2 mt-2">
                {previews.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src + i} src={src} alt="" className="aspect-square object-contain rounded border" />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => submit(false)} disabled={saving || !name.trim() || stickers.length < 5}>
                {t("marketplace.submit")}
              </Button>
              <Button variant="outline" onClick={() => submit(true)} disabled={saving || !name.trim()}>
                {t("marketplace.draft")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
