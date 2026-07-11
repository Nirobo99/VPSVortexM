"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { api, type ChannelInfo } from "@/lib/api";
import { Button, Card, CardContent, Input } from "@/components/ui";

export default function ChannelsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (user) api.getChannels().then(setChannels).catch(() => {});
  }, [user]);

  const doSearch = () => api.getChannels(search).then(setChannels);

  if (loading || !user) {
    return (
      <AppShell>
        <div className="animate-pulse">...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">{t("channels.title")}</h1>
        <Link href="/channels/new">
          <Button>{t("channels.create")}</Button>
        </Link>
      </div>

      <div className="flex gap-2 mb-6">
        <Input
          placeholder={t("channels.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
        />
        <Button variant="outline" onClick={doSearch}>{t("chats.search")}</Button>
      </div>

      <div className="space-y-3">
        {channels.map((ch) => (
          <Link key={ch.id} href={`/channels/${ch.slug}`}>
            <Card className="hover:border-primary/50 transition-colors">
              <CardContent className="py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {ch.is_verified && <span className="text-primary mr-1">✓</span>}
                    {ch.title}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    @{ch.slug} · {ch.subscriber_count} {t("channels.subscribers")}
                    {ch.subscription_price > 0 && ` · ${ch.subscription_price} ₽`}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{ch.visibility}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
        {channels.length === 0 && <p className="text-center text-muted-foreground py-8">{t("channels.empty")}</p>}
      </div>

      <div className="mt-8">
        <Link href="/groups">
          <Button variant="outline">{t("groups.title")}</Button>
        </Link>
      </div>
    </AppShell>
  );
}
