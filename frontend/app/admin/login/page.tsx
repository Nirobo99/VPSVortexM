"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { getCaptchaToken } from "@/lib/captcha";
import { adminApi, saveAdminTokens, saveCsrfToken } from "@/lib/adminApi";
import { Card, CardContent } from "@/components/ui";

export default function AdminLoginPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const captchaToken = await getCaptchaToken("admin_login");
      const res = await adminApi.login(email, password, totp || undefined, captchaToken);
      saveAdminTokens(res.access_token, res.refresh_token);
      const csrf = await adminApi.csrf();
      saveCsrfToken(csrf.csrf_token);
      window.location.href = "/admin";
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-primary/5">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-6">
          <h1 className="text-2xl font-bold text-center mb-2">VortexM Admin</h1>
          <p className="text-sm text-muted-foreground text-center mb-6">{t("adminPanel.loginHint")}</p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-sm">{t("auth.email")}</label>
              <input
                type="email"
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm mt-1"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm">{t("auth.password")}</label>
              <input
                type="password"
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm mt-1"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm">2FA (TOTP)</label>
              <input
                type="text"
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm mt-1"
                value={totp}
                onChange={(e) => setTotp(e.target.value)}
                placeholder={t("adminPanel.totpOptional")}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-md bg-primary text-primary-foreground font-medium text-sm disabled:opacity-50"
            >
              {t("nav.login")}
            </button>
          </form>
          <Link href="/dashboard" className="block text-center text-xs text-muted-foreground mt-4 hover:text-foreground">
            ← {t("nav.dashboard")}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
