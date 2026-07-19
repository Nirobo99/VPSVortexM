"use client";

import { I18nextProvider } from "react-i18next";
import i18n from "@/lib/i18n";
import { ThemeProvider } from "@/components/ThemeProvider";
import { CallProvider } from "@/components/calls/CallProvider";
import { HotkeysProvider } from "@/components/HotkeysProvider";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { OfflineBanner } from "@/components/OfflineBanner";
import { DevNoticeBanner } from "@/components/DevNoticeBanner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>
        <CallProvider>
          <HotkeysProvider>
            <DevNoticeBanner />
            <OfflineBanner />
            {children}
            <PwaInstallBanner />
          </HotkeysProvider>
        </CallProvider>
      </ThemeProvider>
    </I18nextProvider>
  );
}
