"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { LanguageSwitcher } from "@/components/auth/AuthLayout";
import { AnimatedBackground } from "@/components/landing/AnimatedBackground";

export default function HomePage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4 sm:p-6" data-build={process.env.NEXT_PUBLIC_BUILD_ID || "dev"}>
      <AnimatedBackground />

      <div className="absolute top-4 right-4 z-20">
        <LanguageSwitcher />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="landing-frame">
          <div className="landing-frame__inner p-8 sm:p-10 text-center">
            <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-primary via-purple-400 to-pink-400 bg-clip-text text-transparent mb-3">
              {t("app.name")}
            </h1>
            <p className="text-muted-foreground mb-8 text-base sm:text-lg">{t("app.tagline")}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/login" className="flex-1">
                <Button size="lg" className="w-full shadow-lg shadow-primary/25">
                  {t("nav.login")}
                </Button>
              </Link>
              <Link href="/register" className="flex-1">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full border-white/20 bg-background/40 backdrop-blur hover:bg-background/60"
                >
                  {t("nav.register")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
