"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { storeReferralCode } from "@/components/referral/ReferralCodeInput";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export default function ReferralLandingPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const code = String(params?.code || "").toUpperCase();
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) {
      router.replace("/");
      return;
    }
    api
      .validateReferralCode(code)
      .then((res) => {
        if (!res.valid) {
          router.replace("/");
          return;
        }
        storeReferralCode(code);
        setUsername(res.referrer_username);
      })
      .catch(() => router.replace("/"))
      .finally(() => setLoading(false));
  }, [code, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">…</div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-2xl text-primary">VortexM</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-lg">
            {username
              ? t("referral.invite_landing", { username })
              : t("referral.description")}
          </p>
          <p className="text-sm text-muted-foreground">{t("app.tagline")}</p>
          <div className="flex flex-col gap-2">
            <Button asChild className="w-full">
              <Link href={`/register?ref=${encodeURIComponent(code)}`}>{t("nav.register")}</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/login">{t("nav.login")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
