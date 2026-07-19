"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Users } from "lucide-react";
import { api, type ReferralInfo, type ReferralListItem } from "@/lib/api";
import { Avatar, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

export function ReferralSection() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [items, setItems] = useState<ReferralListItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [listLoading, setListLoading] = useState(false);

  useEffect(() => {
    api
      .getReferralInfo()
      .then(setInfo)
      .catch((e) => setError(e instanceof Error ? e.message : t("auth.error")));
  }, [t]);

  const copyLink = async () => {
    if (!info?.referral_link) return;
    try {
      await navigator.clipboard.writeText(info.referral_link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t("auth.error"));
    }
  };

  const openList = async () => {
    setListOpen(true);
    setListLoading(true);
    try {
      const res = await api.getReferralList(1, 20);
      setItems(res.items);
      setPage(res.page);
      setHasMore(res.has_more);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.error"));
    } finally {
      setListLoading(false);
    }
  };

  const loadMore = async () => {
    setListLoading(true);
    try {
      const res = await api.getReferralList(page + 1, 20);
      setItems((prev) => [...prev, ...res.items]);
      setPage(res.page);
      setHasMore(res.has_more);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.error"));
    } finally {
      setListLoading(false);
    }
  };

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          {t("referral.title")}
        </CardTitle>
        <CardDescription>{t("referral.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {copied && (
          <p className="text-sm text-emerald-500" role="status">
            {t("referral.copied")}
          </p>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">{t("referral.your_link")}</p>
          <div className="flex gap-2">
            <Input readOnly value={info?.referral_link || "…"} className="font-mono text-xs sm:text-sm" />
            <Button type="button" variant="outline" onClick={copyLink} disabled={!info} aria-label={t("referral.copied")}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          {info?.referral_code && (
            <p className="text-xs text-muted-foreground">
              {t("referral.referral_code")}: <span className="font-mono">{info.referral_code}</span>
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5 text-sm">
          <p className="font-medium">{t("referral.stats")}</p>
          <p>
            {t("referral.invited")}: <strong>{info?.referral_count ?? 0}</strong>
          </p>
          <p>
            {t("referral.purchased")}: <strong>{info?.purchased_count ?? 0}</strong>
          </p>
          <p>
            {t("referral.earned")}:{" "}
            <strong className="text-primary">{(info?.total_bonus_earned ?? 0).toLocaleString()} VM</strong>
          </p>
        </div>

        <Button type="button" variant="secondary" onClick={openList}>
          {t("referral.view_list")}
        </Button>

        {listOpen && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-black/50"
              aria-label={t("navigation.close_menu")}
              onClick={() => setListOpen(false)}
            />
            <div className="relative z-10 w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-xl border border-border bg-background p-4 shadow-xl space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">{t("referral.view_list")}</h3>
                <Button type="button" variant="outline" size="sm" onClick={() => setListOpen(false)}>
                  ×
                </Button>
              </div>
              {listLoading && items.length === 0 && <p className="text-sm text-muted-foreground">…</p>}
              {items.length === 0 && !listLoading && (
                <p className="text-sm text-muted-foreground">{t("referral.invited")}: 0</p>
              )}
              <ul className="space-y-2">
                {items.map((item) => (
                  <li
                    key={`${item.username}-${item.registered_at}`}
                    className="flex items-center gap-3 rounded-lg border border-border p-2.5"
                  >
                    <Avatar src={item.avatar_url} name={item.username} className="h-9 w-9 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">@{item.username}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.registered_at
                          ? new Date(item.registered_at).toLocaleDateString()
                          : "—"}
                      </p>
                    </div>
                    <div className="text-right text-xs shrink-0">
                      <p
                        className={cn(
                          "font-medium",
                          item.has_purchased ? "text-emerald-500" : "text-muted-foreground"
                        )}
                      >
                        {item.has_purchased ? t("referral.made_purchase") : t("referral.registered")}
                      </p>
                      {item.has_purchased && (
                        <p className="text-primary">
                          {t("referral.bonus")}: {item.bonus_earned} VM
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {hasMore && (
                <Button type="button" variant="outline" className="w-full" onClick={loadMore} disabled={listLoading}>
                  {listLoading ? "…" : t("marketplace.loadMore")}
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
