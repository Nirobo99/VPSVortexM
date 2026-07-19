import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "VortexM — Мессенджер",
  description: "Безопасный мессенджер нового поколения",
  manifest: "/manifest.json",
  other: {
    "vortexm-build": process.env.NEXT_PUBLIC_BUILD_ID ?? "dev",
  },
  icons: {
    icon: [
      { url: "/favicon.jpg", type: "image/jpeg" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
    shortcut: "/favicon.jpg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "VortexM",
  },
};

export const viewport: Viewport = {
  themeColor: "#7c3aed",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        {recaptchaSiteKey ? (
          <Script src={`https://www.google.com/recaptcha/api.js?render=${recaptchaSiteKey}`} strategy="afterInteractive" />
        ) : null}
        <Providers>
          {/* CircleNavHost is mounted inside Providers (auth + i18n). */}
          {children}
        </Providers>
      </body>
    </html>
  );
}
