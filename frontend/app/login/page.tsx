"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button, Input, Label, Card, CardHeader, CardTitle, CardContent, Alert } from "@/components/ui";
import { getCaptchaToken } from "@/lib/captcha";
import { api, saveTokens } from "@/lib/api";

export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [showTotp, setShowTotp] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const captchaToken = await getCaptchaToken("login");
      const tokens = await api.login(email, password, showTotp ? totpCode : undefined, captchaToken);
      saveTokens(tokens);
      router.push("/dashboard");
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("auth.error");
      if (msg.toLowerCase().includes("2fa") || msg.toLowerCase().includes("totp")) {
        setShowTotp(true);
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={t("auth.loginTitle")}>
      <Card>
        <CardHeader>
          <CardTitle>{t("auth.loginTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert variant="destructive">{error}</Alert>}
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>
            {showTotp && (
              <div className="space-y-2">
                <Label htmlFor="totp">{t("auth.totpCode")}</Label>
                <Input id="totp" value={totpCode} onChange={(e) => setTotpCode(e.target.value)} maxLength={6} />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "..." : t("auth.loginButton")}
            </Button>
          </form>
          <div className="mt-4 flex flex-col gap-2 text-sm text-center text-muted-foreground">
            <Link href="/forgot-password" className="text-primary hover:underline">
              {t("auth.forgotPassword")}
            </Link>
            <p>
              {t("auth.noAccount")}{" "}
              <Link href="/register" className="text-primary hover:underline">
                {t("nav.register")}
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
