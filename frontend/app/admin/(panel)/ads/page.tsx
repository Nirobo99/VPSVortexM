"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminApi } from "@/lib/adminApi";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button, Card, CardContent, Input } from "@/components/ui";

export default function AdminAdsPage() {
  const { t } = useTranslation();
  const { can } = useAdminAuth();
  const [ads, setAds] = useState<Record<string, unknown>[]>([]);
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");

  const load = () => adminApi.ads().then(setAds);
  useEffect(() => { load(); }, []);

  const create = async () => {
    await adminApi.createAd({ title, link_url: link, is_active: true });
    setTitle("");
    setLink("");
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">{t("adminPanel.ads")}</h1>
      {can("ads", "create") && (
        <Card className="mb-6">
          <CardContent className="pt-4 space-y-3">
            <Input placeholder={t("admin.annTitle")} value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input placeholder="URL" value={link} onChange={(e) => setLink(e.target.value)} />
            <Button onClick={create} disabled={!title}>{t("admin.publish")}</Button>
          </CardContent>
        </Card>
      )}
      <div className="space-y-2">
        {ads.map((ad) => (
          <Card key={String(ad.id)}>
            <CardContent className="py-3 flex justify-between">
              <div>
                <p className="font-medium">{String(ad.title)}</p>
                <p className="text-sm text-muted-foreground">{String(ad.link_url)} · 👁 {String(ad.impressions)} · 🖱 {String(ad.clicks)}</p>
              </div>
              {can("ads", "delete") && (
                <Button size="sm" variant="destructive" onClick={() => adminApi.deleteAd(String(ad.id)).then(load)}>{t("admin.delete")}</Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
