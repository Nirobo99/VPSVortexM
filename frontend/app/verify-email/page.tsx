"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Card, CardHeader, CardTitle, CardContent, Alert } from "@/components/ui";
import { api } from "@/lib/api";

function VerifyContent() {
  const { t } = useTranslation();
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage(t("auth.verifyError"));
      return;
    }
    api.verifyEmail(token)
      .then((res) => {
        setStatus("success");
        setMessage(res.message || t("auth.verifySuccess"));
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : t("auth.verifyError"));
      });
  }, [token, t]);

  return (
    <>
      {status === "loading" && <Alert>...</Alert>}
      {status === "success" && <Alert>{message}</Alert>}
      {status === "error" && <Alert variant="destructive">{message}</Alert>}
      {status !== "loading" && (
        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-primary hover:underline">{t("nav.login")}</Link>
        </p>
      )}
    </>
  );
}

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  return (
    <AuthLayout title={t("auth.verifyTitle")}>
      <Card>
        <CardHeader>
          <CardTitle>{t("auth.verifyTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Alert>...</Alert>}>
            <VerifyContent />
          </Suspense>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
