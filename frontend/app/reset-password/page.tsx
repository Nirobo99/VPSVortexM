"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button, Input, Label, Card, CardHeader, CardTitle, CardContent, Alert } from "@/components/ui";
import { api } from "@/lib/api";

function ResetForm() {
  const { t } = useTranslation();
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.confirmPasswordReset(token, password);
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.error"));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return <Alert variant="destructive">{t("auth.error")}</Alert>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Alert variant="destructive">{error}</Alert>}
      {message && <Alert>{message}</Alert>}
      <div className="space-y-2">
        <Label htmlFor="password">{t("auth.newPassword")}</Label>
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
      </div>
      <Button type="submit" className="w-full" disabled={loading || !!message}>
        {loading ? "..." : t("auth.resetConfirmButton")}
      </Button>
      {message && (
        <p className="text-center text-sm">
          <Link href="/login" className="text-primary hover:underline">{t("nav.login")}</Link>
        </p>
      )}
    </form>
  );
}

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  return (
    <AuthLayout title={t("auth.resetTitle")}>
      <Card>
        <CardHeader>
          <CardTitle>{t("auth.resetTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div>...</div>}>
            <ResetForm />
          </Suspense>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
