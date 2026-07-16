"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { api, type WalletHistory } from "@/lib/api";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@/components/ui";

const HISTORY_LIMIT = 5;
const SUPPORT_PROFILE_PATH = "/users/" + encodeURIComponent("VortexM Поддержка");
const CONVERT_PRESETS = [200, 500, 1000, 2000];

type Panel = "topup" | "transfer" | "convert" | null;

export default function WalletPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading, reload } = useAuth();
  const [history, setHistory] = useState<WalletHistory | null>(null);
  const [transferUser, setTransferUser] = useState("");
  const [transferAmount, setTransferAmount] = useState(100);
  const [convertAmount, setConvertAmount] = useState(200);
  const [converting, setConverting] = useState(false);
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

  const convert = async () => {
    const amount = Math.floor(convertAmount / 2) * 2;
    if (amount < 2) return;
    setConverting(true);
    try {
      await api.convertToVmoney(amount);
      await reload();
      load();
      setPanel(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : t("auth.error"));
    } finally {
      setConverting(false);
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
  const vmoney = history?.vmoney_balance ?? user.vmoney_balance ?? 0;
  const transactions = (history?.transactions ?? []).slice(0, HISTORY_LIMIT);
  const receivedVmoney = Math.floor(convertAmount / 2);

  const paidFeatures = [
    {
      id: "invisible",
      title: t("wallet.invisibleTitle"),
      description: t("wallet.invisibleHint"),
      price: `${prices.invisible_monthly} VM/${t("wallet.perMonth")}`,
      action: buyInvisible,
      actionLabel: t("wallet.buy"),
    },
    {
      id: "groups",
      title: t("wallet.groupExtensionTitle"),
      description: t("wallet.groupExtensionHint"),
      price: `${prices.group_extension} VM`,
      href: "/messages?tab=groups",
      actionLabel: t("wallet.buy"),
    },
    {
      id: "channels",
      title: t("wallet.channelSubsTitle"),
      description: t("wallet.channelSubsHint"),
      price: t("wallet.fromVmoney"),
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">{t("wallet.rubles")}</p>
                <p className="text-4xl font-bold text-primary">{balance.toLocaleString()} ₽</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("wallet.vmoney")}</p>
                <p className="text-4xl font-bold">{vmoney.toLocaleString()} VM</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-3">{t("wallet.balanceHint")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("wallet.rateHint")}</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Button
            size="lg"
            variant={panel === "topup" ? "default" : "outline"}
            onClick={() => setPanel(panel === "topup" ? null : "topup")}
          >
            {t("wallet.topUp")}
          </Button>
          <Button
            size="lg"
            variant={panel === "convert" ? "default" : "outline"}
            onClick={() => setPanel(panel === "convert" ? null : "convert")}
          >
            {t("wallet.convert")}
          </Button>
          <Button
            size="lg"
            variant={panel === "transfer" ? "default" : "outline"}
            onClick={() => setPanel(panel === "transfer" ? null : "transfer")}
            className="col-span-2 sm:col-span-1"
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
              <div className="text-sm whitespace-pre-line leading-relaxed rounded-md border border-border bg-muted/30 p-4">
                {t("wallet.manualTopupNotice")}
              </div>
              <Button asChild className="w-full sm:w-auto">
                <Link href={SUPPORT_PROFILE_PATH}>{t("wallet.sendConfirmation")}</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {panel === "convert" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("wallet.convertTitle")}</CardTitle>
              <CardDescription>{t("wallet.convertHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {CONVERT_PRESETS.map((p) => (
                  <Button
                    key={p}
                    variant={convertAmount === p ? "default" : "outline"}
                    size="sm"
                    onClick={() => setConvertAmount(p)}
                  >
                    {p} ₽
                  </Button>
                ))}
              </div>
              <div>
                <Label>{t("wallet.convertAmount")}</Label>
                <Input
                  type="number"
                  min={2}
                  step={2}
                  max={balance}
                  value={convertAmount}
                  onChange={(e) => setConvertAmount(Number(e.target.value))}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {t("wallet.convertPreview", { rubles: Math.floor(convertAmount / 2) * 2, vmoney: receivedVmoney })}
              </p>
              <Button
                onClick={convert}
                disabled={converting || convertAmount < 2 || convertAmount > balance}
              >
                {t("wallet.convertConfirm")}
              </Button>
            </CardContent>
          </Card>
        )}

        {panel === "transfer" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("wallet.transfer")}</CardTitle>
              <CardDescription>{t("wallet.transferRublesHint")}</CardDescription>
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
