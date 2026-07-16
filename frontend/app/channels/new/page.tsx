"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { api } from "@/lib/api";
import { Avatar, Button, Input, Label, Select, Textarea } from "@/components/ui";

export default function NewChannelPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [price, setPrice] = useState(0);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);

  const onAvatarPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setAvatarFile(file);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(file ? URL.createObjectURL(file) : null);
  };

  const submit = async () => {
    setSaving(true);
    try {
      const ch = await api.createChannel(title, description, visibility, price);
      if (avatarFile) {
        try {
          await api.uploadChannelAvatar(ch.slug, avatarFile);
        } catch {
          // Channel created; avatar can be set later in settings.
        }
      }
      router.push(`/channels/${ch.slug}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : t("auth.error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold mb-6">{t("channels.create")}</h1>
      <div className="space-y-4 max-w-md">
        <div className="flex items-center gap-4">
          <Avatar src={avatarPreview} name={title || "?"} className="h-16 w-16" />
          <div>
            <input
              ref={avatarRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onAvatarPick}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => avatarRef.current?.click()}>
              {t("channels.changeAvatar")}
            </Button>
          </div>
        </div>
        <div>
          <Label>{t("channels.name")}</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label>{t("profile.bio")}</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
        <div>
          <Label>{t("channels.visibility")}</Label>
          <Select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="public">{t("channels.public")}</option>
            <option value="closed">{t("channels.closed")}</option>
          </Select>
        </div>
        <div>
          <Label>{t("channels.subscriptionPrice")}</Label>
          <Input type="number" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
        </div>
        <Button onClick={submit} disabled={saving || !title.trim()}>
          {t("channels.create")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("channels.verificationOnlyViaAdmin")}</p>
      </div>
    </AppShell>
  );
}
