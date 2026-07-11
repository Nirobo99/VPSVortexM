"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button, Input, Label, Card, CardHeader, CardTitle, CardContent, Alert } from "@/components/ui";
import { getCaptchaToken } from "@/lib/captcha";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const captchaToken = await getCaptchaToken("password_reset");
      const res = await api.requestPasswordReset(email, captchaToken);
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={t("auth.resetTitle")}>
      <Card>
        <CardHeader>
          <CardTitle>{t("auth.resetTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert variant="destructive">{error}</Alert>}
            {message && <Alert>{message}</Alert>}
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "..." : t("auth.resetButton")}
            </Button>
          </form>
          <p className="mt-4 text-sm text-center">
            <Link href="/login" className="text-primary hover:underline">
              {t("nav.login")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
