"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { applyTheme, loadStoredTheme, storeTheme } from "@/lib/theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  useEffect(() => {
    const stored = loadStoredTheme();
    if (stored) applyTheme(stored);
  }, []);

  useEffect(() => {
    if (!user) return;
    const settings = {
      theme_mode: user.theme_mode,
      theme_primary: user.theme_primary,
      theme_accent: user.theme_accent,
    };
    storeTheme(settings);
    applyTheme(settings);
  }, [user?.theme_mode, user?.theme_primary, user?.theme_accent, user]);

  return <>{children}</>;
}
