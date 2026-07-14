"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { api, type WalletHistory } from "@/lib/api";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@/components/ui";

const PRESETS = [100, 500, 1000, 5000];

export default function WalletPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading, reload } = useAuth();
  const [history, setHistory] = useState<WalletHistory | null>(null);
  const [amount, setAmount] = useState(500);
  const [transferUser, setTransferUser] = useState("");
  const [transferAmount, setTransferAmount] = useState(100);
  const [topingUp, setTopingUp] = useState(false);
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

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold mb-6">{t("wallet.title")}</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">{t("wallet.balance")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-4xl font-bold text-primary">{balance.toLocaleString()} ₽</p>
          <p className="text-sm text-muted-foreground mt-2">{t("wallet.balanceHint")}</p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">{t("wallet.topUp")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 max-w-md">
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
            {t("wallet.topUp")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("wallet.yookassaHint")}</p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">{t("wallet.transfer")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 max-w-md">
          <Input placeholder={t("wallet.transferUsername")} value={transferUser} onChange={(e) => setTransferUser(e.target.value)} />
          <Input type="number" min={1} value={transferAmount} onChange={(e) => setTransferAmount(Number(e.target.value))} />
          <Button onClick={transfer} disabled={!transferUser.trim()}>{t("wallet.transferBtn")}</Button>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">{t("wallet.paidFeatures")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 max-w-md text-sm">
          <p>{t("wallet.invisibleHint")}</p>
          <Button onClick={buyInvisible}>
            {t("wallet.invisibleBuy", { price: prices.invisible_monthly })}
          </Button>
          <p className="text-muted-foreground">
            {t("groups.extend")} · {t("channels.subscriptionPrice")}
          </p>
          <Link href="/channels" className="text-primary hover:underline block">{t("channels.title")} →</Link>
          <Link href="/groups" className="text-primary hover:underline block">{t("groups.title")} →</Link>
        </CardContent>
      </Card>

      <h2 className="text-lg font-medium mb-3">{t("wallet.history")}</h2>
      <div className="space-y-2">
        {(history?.transactions ?? []).map((tx) => (
          <Card key={tx.id}>
            <CardContent className="py-3 flex justify-between items-center">
              <div>
                <p className="text-sm font-medium">
                  {tx.transaction_type === "topup" ? "+" : ""}
                  {tx.amount} ₽
                </p>
                <p className="text-xs text-muted-foreground">
                  {tx.description || t(`wallet.type.${tx.transaction_type}`)}
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>{new Date(tx.created_at).toLocaleString()}</p>
                <p>{t("wallet.after")}: {tx.balance_after} ₽</p>
              </div>
            </CardContent>
          </Card>
        ))}
        {(history?.transactions ?? []).length === 0 && (
          <p className="text-center text-muted-foreground py-6">{t("wallet.empty")}</p>
        )}
      </div>
    </AppShell>
  );
}
