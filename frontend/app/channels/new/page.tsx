"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { api } from "@/lib/api";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";

export default function NewChannelPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [price, setPrice] = useState(0);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const ch = await api.createChannel(title, description, visibility, price);
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
      </div>
    </AppShell>
  );
}
