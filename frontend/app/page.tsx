"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { LanguageSwitcher } from "@/components/auth/AuthLayout";

export default function HomePage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/10">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <h1 className="text-5xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent mb-4">
        {t("app.name")}
      </h1>
      <p className="text-muted-foreground text-lg mb-8 text-center max-w-md">{t("app.tagline")}</p>
      <div className="flex gap-4">
        <Link href="/login">
          <Button size="lg">{t("nav.login")}</Button>
        </Link>
        <Link href="/register">
          <Button size="lg" variant="outline">{t("nav.register")}</Button>
        </Link>
      </div>
    </div>
  );
}
