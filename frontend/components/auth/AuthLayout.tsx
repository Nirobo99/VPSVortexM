"use client";

import { useTranslation } from "react-i18next";
import Link from "next/link";

const LANGS = ["ru", "en", "fr", "tt", "tg"] as const;

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  return (
    <select
      value={i18n.language?.slice(0, 2) || "ru"}
      onChange={(e) => {
        i18n.changeLanguage(e.target.value);
        localStorage.setItem("vortexm_locale", e.target.value);
      }}
      className="rounded-md border border-input bg-background px-2 py-1 text-sm"
    >
      {LANGS.map((lang) => (
        <option key={lang} value={lang}>
          {t(`lang.${lang}`)}
        </option>
      ))}
    </select>
  );
}

export function AuthLayout({ children, title }: { children: React.ReactNode; title: string }) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/10">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="mb-8 text-center">
        <Link href="/" className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
          {t("app.name")}
        </Link>
        <p className="text-muted-foreground mt-2">{t("app.tagline")}</p>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
