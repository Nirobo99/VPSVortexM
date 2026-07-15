"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { api, type WalletHistory } from "@/lib/api";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@/components/ui";

const PRESETS = [100, 500, 1000, 5000];
const HISTORY_LIMIT = 5;

type Panel = "topup" | "transfer" | null;

export default function WalletPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading, reload } = useAuth();
  const [history, setHistory] = useState<WalletHistory | null>(null);
  const [amount, setAmount] = useState(500);
  const [transferUser, setTransferUser] = useState("");
  const [transferAmount, setTransferAmount] = useState(100);
  const [topingUp, setTopingUp] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [prices, setPrices] = useState({ invisible_monthly: 199, group_extension: 500 });

  const load = () => api.getWalletHistory().then(setHistory).catch(() => {});

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      load();
      api.getWalletPrices().then(setPrices).catch(() => {});
    }
  }, [user]);

  const topUp = async () => {
    setTopingUp(true);
    try {
      const res = await api.topUpWallet(amount);
      if (res.confirmation_url && res.status === "pending") {
        window.location.href = res.confirmation_url;
        return;
      }
      if (res.confirmation_url && res.status === "succeeded") {
        router.push(`/wallet/success?payment_id=${res.payment_id}`);
        return;
      }
      await reload();
      load();
      setPanel(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : t("auth.error"));
    } finally {
      setTopingUp(false);
    }
  };

  const transfer = async () => {
    try {
      await api.transferWallet(transferUser.trim(), transferAmount);
      await reload();
      load();
      setTransferUser("");
      setPanel(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  const buyInvisible = async () => {
    try {
      await api.purchaseInvisible();
      await reload();
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  if (loading || !user) {
    return (
      <AppShell>
        <div className="animate-pulse">...</div>
      </AppShell>
    );
  }

  const balance = history?.balance ?? user.wallet_balance;
  const transactions = (history?.transactions ?? []).slice(0, HISTORY_LIMIT);

  const paidFeatures = [
    {
      id: "invisible",
      title: t("wallet.invisibleTitle"),
      description: t("wallet.invisibleHint"),
      price: `${prices.invisible_monthly} ₽/${t("wallet.perMonth")}`,
      action: buyInvisible,
      actionLabel: t("wallet.buy"),
    },
    {
      id: "groups",
      title: t("wallet.groupExtensionTitle"),
      description: t("wallet.groupExtensionHint"),
      price: `${prices.group_extension} ₽`,
      href: "/messages?tab=groups",
      actionLabel: t("wallet.buy"),
    },
    {
      id: "channels",
      title: t("wallet.channelSubsTitle"),
      description: t("wallet.channelSubsHint"),
      price: t("wallet.fromBalance"),
      href: "/messages?tab=channels",
      actionLabel: t("wallet.buy"),
    },
  ];

  const legalLinks = [
    { slug: "rules", label: t("wallet.legalTerms") },
    { slug: "about", label: t("wallet.legalAbout") },
    { slug: "rules", label: t("wallet.legalPrivacy") },
  ];

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold">{t("wallet.title")}</h1>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{t("wallet.balance")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold text-primary">{balance.toLocaleString()} ₽</p>
            <p className="text-sm text-muted-foreground mt-2">{t("wallet.balanceHint")}</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            variant={panel === "topup" ? "default" : "outline"}
            onClick={() => setPanel(panel === "topup" ? null : "topup")}
          >
            {t("wallet.topUp")}
          </Button>
          <Button
            size="lg"
            variant={panel === "transfer" ? "default" : "outline"}
            onClick={() => setPanel(panel === "transfer" ? null : "transfer")}
          >
            {t("wallet.transferBtn")}
          </Button>
        </div>

        {panel === "topup" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("wallet.topUp")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <Button
                    key={p}
                    variant={amount === p ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAmount(p)}
                  >
                    {p} ₽
                  </Button>
                ))}
              </div>
              <div>
                <Label>{t("wallet.amount")}</Label>
                <Input
                  type="number"
                  min={10}
                  max={100000}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                />
              </div>
              <Button onClick={topUp} disabled={topingUp || amount < 10}>
                {t("wallet.topUpConfirm")}
              </Button>
              <p className="text-xs text-muted-foreground">{t("wallet.yookassaHint")}</p>
            </CardContent>
          </Card>
        )}

        {panel === "transfer" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("wallet.transfer")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>{t("wallet.transferUsername")}</Label>
                <Input
                  placeholder={t("wallet.transferUsername")}
                  value={transferUser}
                  onChange={(e) => setTransferUser(e.target.value)}
                />
              </div>
              <div>
                <Label>{t("wallet.transferAmount")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(Number(e.target.value))}
                />
              </div>
              <Button onClick={transfer} disabled={!transferUser.trim()}>
                {t("wallet.transferConfirm")}
              </Button>
            </CardContent>
          </Card>
        )}

        <section>
          <h2 className="text-lg font-medium mb-3">{t("wallet.history")}</h2>
          <div className="space-y-2">
            {transactions.map((tx) => (
              <Card key={tx.id}>
                <CardContent className="py-3 flex justify-between items-center gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {tx.transaction_type === "topup" ? "+" : ""}
                      {tx.amount} ₽ · {tx.description || t(`wallet.type.${tx.transaction_type}`)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(tx.created_at).toLocaleString()}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground shrink-0">
                    {tx.balance_after} ₽
                  </p>
                </CardContent>
              </Card>
            ))}
            {transactions.length === 0 && (
              <p className="text-center text-muted-foreground py-4 text-sm">{t("wallet.empty")}</p>
            )}
          </div>
        </section>

        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="py-4">
            <p className="text-sm font-medium text-primary">{t("wallet.paidPromoTitle")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("wallet.paidPromoText")}</p>
          </CardContent>
        </Card>

        <section>
          <h2 className="text-lg font-medium mb-3">{t("wallet.paidFeatures")}</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
            {paidFeatures.map((feature) => (
              <Card key={feature.id} className="min-w-[220px] max-w-[240px] shrink-0 snap-start flex flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{feature.title}</CardTitle>
                  <CardDescription className="text-xs line-clamp-3">{feature.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto space-y-3">
                  <p className="text-sm font-semibold text-primary">{feature.price}</p>
                  {feature.href ? (
                    <Link href={feature.href} className="block">
                      <Button className="w-full" size="sm">
                        {feature.actionLabel}
                      </Button>
                    </Link>
                  ) : (
                    <Button className="w-full" size="sm" onClick={feature.action}>
                      {feature.actionLabel}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <footer className="border-t border-border pt-6 pb-2">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">{t("wallet.legalTitle")}</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {legalLinks.map((link) => (
              <Link
                key={`${link.slug}-${link.label}`}
                href={`/pages/${link.slug}`}
                className="text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </footer>
      </div>
    </AppShell>
  );
}
