"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { Button, Card, CardContent } from "@/components/ui";

function WalletSuccessContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const paymentId = searchParams.get("payment_id");
  const { user, loading, reload } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !paymentId) return;
    api
      .confirmWalletPayment(paymentId)
      .then((res) => {
        setStatus(res.status);
        setBalance(res.balance);
        reload();
      })
      .catch(() => setStatus("error"));
  }, [user, paymentId, reload]);

  if (loading || !user) {
    return <div className="animate-pulse">...</div>;
  }

  const succeeded = status === "succeeded";

  return (
    <Card className="max-w-md mx-auto mt-8">
      <CardContent className="pt-8 pb-6 text-center space-y-4">
        {status === null && <p className="text-muted-foreground">{t("wallet.checking")}</p>}
        {succeeded && (
          <>
            <p className="text-4xl">✓</p>
            <h1 className="text-xl font-semibold text-primary">{t("wallet.topupSuccess")}</h1>
            {balance != null && (
              <p className="text-muted-foreground">
                {t("wallet.balance")}: <span className="font-medium text-foreground">{balance} ₽</span>
              </p>
            )}
          </>
        )}
        {status === "pending" && (
          <>
            <p className="text-2xl">⏳</p>
            <h1 className="text-xl font-semibold">{t("wallet.topupPending")}</h1>
          </>
        )}
        {status === "canceled" && (
          <>
            <p className="text-2xl">✕</p>
            <h1 className="text-xl font-semibold">{t("wallet.topupCanceled")}</h1>
          </>
        )}
        {status === "error" && (
          <h1 className="text-xl font-semibold text-destructive">{t("auth.error")}</h1>
        )}
        <Link href="/wallet">
          <Button className="mt-2">{t("wallet.backToWallet")}</Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export default function WalletSuccessPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="animate-pulse">...</div>}>
        <WalletSuccessContent />
      </Suspense>
    </AppShell>
  );
}
