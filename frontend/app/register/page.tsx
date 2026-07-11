"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button, Input, Label, Card, CardHeader, CardTitle, CardContent, Alert } from "@/components/ui";
import { getCaptchaToken } from "@/lib/captcha";
import { api } from "@/lib/api";

export default function RegisterPage() {
  const { t, i18n } = useTranslation();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (password !== confirmPassword) {
      setError(t("auth.error"));
      return;
    }
    setLoading(true);
    try {
      const captchaToken = await getCaptchaToken("register");
      const res = await api.register({
        username,
        email,
        password,
        locale: i18n.language?.slice(0, 2) || "ru",
        captcha_token: captchaToken,
      });
      setSuccess(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={t("auth.registerTitle")}>
      <Card>
        <CardHeader>
          <CardTitle>{t("auth.registerTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert variant="destructive">{error}</Alert>}
            {success && <Alert>{success}</Alert>}
            <div className="space-y-2">
              <Label htmlFor="username">{t("auth.username")}</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">{t("auth.confirmPassword")}</Label>
              <Input id="confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "..." : t("auth.registerButton")}
            </Button>
          </form>
          <p className="mt-4 text-sm text-center text-muted-foreground">
            {t("auth.hasAccount")}{" "}
            <Link href="/login" className="text-primary hover:underline">
              {t("nav.login")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
