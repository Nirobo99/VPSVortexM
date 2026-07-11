"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminApi } from "@/lib/adminApi";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button, Card, CardContent, Input } from "@/components/ui";

export default function AdminChannelsPage() {
  const { t } = useTranslation();
  const { can } = useAdminAuth();
  const [channels, setChannels] = useState<Record<string, unknown>[]>([]);
  const [groups, setGroups] = useState<Record<string, unknown>[]>([]);
  const [tab, setTab] = useState<"channels" | "groups">("channels");
  const [q, setQ] = useState("");

  const load = () => {
    adminApi.channels(q || undefined).then(setChannels);
    adminApi.groups().then(setGroups);
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">{t("adminPanel.channels")}</h1>
      <div className="flex gap-2 mb-4">
        <Button variant={tab === "channels" ? "default" : "outline"} size="sm" onClick={() => setTab("channels")}>{t("nav.channels")}</Button>
        <Button variant={tab === "groups" ? "default" : "outline"} size="sm" onClick={() => setTab("groups")}>{t("adminPanel.groups")}</Button>
        {tab === "channels" && (
          <>
            <Input placeholder={t("chats.search")} value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
            <Button variant="outline" size="sm" onClick={load}>{t("chats.search")}</Button>
          </>
        )}
      </div>
      <div className="space-y-2">
        {(tab === "channels" ? channels : groups).map((c) => (
          <Card key={String(c.id || c.slug)}>
            <CardContent className="py-3 flex justify-between items-center gap-4">
              <div>
                <p className="font-medium">{String(c.title || c.name)}</p>
                <p className="text-sm text-muted-foreground">
                  {c.slug ? `@${String(c.slug)}` : ""} · {String(c.member_count ?? c.subscribers_count ?? 0)} {t("adminPanel.members")}
                </p>
              </div>
              {tab === "channels" && can("channels", "verify") && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => adminApi.verifyChannel(String(c.slug), !c.is_verified).then(load)}>
                    {c.is_verified ? t("admin.unverify") : t("admin.verify")}
                  </Button>
                  {can("channels", "delete") && (
                    <Button size="sm" variant="destructive" onClick={() => adminApi.deleteChannel(String(c.slug)).then(load)}>{t("admin.delete")}</Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
