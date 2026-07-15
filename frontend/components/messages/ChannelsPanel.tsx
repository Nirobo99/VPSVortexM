"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { api, type ChannelInfo } from "@/lib/api";
import { Button, Card, CardContent, Input } from "@/components/ui";

export function ChannelsPanel() {
  const { t } = useTranslation();
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.getChannels().then(setChannels).catch(() => {});
  }, []);

  const doSearch = () => api.getChannels(search).then(setChannels);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2">
        <h2 className="text-lg font-semibold">{t("channels.title")}</h2>
        <Link href="/channels/new">
          <Button size="sm">{t("channels.create")}</Button>
        </Link>
      </div>

      <div className="flex gap-2 mb-4">
        <Input
          placeholder={t("channels.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
        />
        <Button variant="outline" onClick={doSearch}>
          {t("chats.search")}
        </Button>
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
    </div>
  );
}
