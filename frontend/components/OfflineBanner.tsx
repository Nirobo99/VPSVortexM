"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export function OfflineBanner() {
  const { t } = useTranslation();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-destructive text-destructive-foreground text-center text-sm py-2 px-4">
      {t("pwa.offline")}
    </div>
  );
}
