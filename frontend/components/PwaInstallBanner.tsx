"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallBanner() {
  const { t } = useTranslation();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (localStorage.getItem("pwa_install_dismissed") === "1") return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setDismissed(false);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") {
      setDeferred(null);
      setDismissed(true);
    }
  };

  const dismiss = () => {
    localStorage.setItem("pwa_install_dismissed", "1");
    setDismissed(true);
    setDeferred(null);
  };

  if (dismissed || !deferred) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-40 bg-card border border-border rounded-lg shadow-lg p-4">
      <p className="text-sm font-medium mb-1">{t("pwa.installTitle")}</p>
      <p className="text-xs text-muted-foreground mb-3">{t("pwa.installHint")}</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={install}>{t("pwa.install")}</Button>
        <Button size="sm" variant="outline" onClick={dismiss}>{t("pwa.dismiss")}</Button>
      </div>
    </div>
  );
}
