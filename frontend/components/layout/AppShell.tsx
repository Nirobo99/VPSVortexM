"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { LanguageSwitcher } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", key: "dashboard" },
  { href: "/chats", key: "chats" },
  { href: "/channels", key: "channels" },
  { href: "/wallet", key: "wallet" },
  { href: "/admin/login", key: "admin", adminOnly: true },
  { href: "/profile", key: "profile" },
  { href: "/settings", key: "settings" },
] as const;

function navActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur z-10">
        <Link href="/dashboard" className="text-xl font-bold text-primary shrink-0">
          {t("app.name")}
        </Link>
        <nav className="hidden sm:flex items-center gap-1 mx-4">
          {NAV.filter((item) => !("adminOnly" in item) || user.has_admin_panel).map(({ href, key }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm transition-colors",
                navActive(pathname, href) ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t(`nav.${key}`)}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link href="/wallet" className="hidden sm:inline text-sm font-medium text-primary hover:underline">
            {user.wallet_balance.toLocaleString()} ₽
          </Link>
          <LanguageSwitcher />
          <Link href={`/users/${user.username}`} className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground truncate max-w-[120px]">
            {user.display_name || user.username}
          </Link>
          <Button variant="outline" size="sm" onClick={logout}>
            {t("nav.logout")}
          </Button>
        </div>
      </header>
      <nav className="sm:hidden border-b border-border flex">
        {NAV.filter((item) => !("adminOnly" in item) || user.has_admin_panel).map(({ href, key }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex-1 py-2.5 text-center text-sm",
              navActive(pathname, href) ? "text-primary border-b-2 border-primary" : "text-muted-foreground"
            )}
          >
            {t(`nav.${key}`)}
          </Link>
        ))}
      </nav>
      <main className="flex-1 p-4 sm:p-6 max-w-4xl mx-auto w-full">{children}</main>
      <footer className="text-center text-xs text-muted-foreground py-2 border-t border-border">
        <button type="button" className="hover:text-foreground" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }))}>
          {t("hotkeys.title")} (?)
        </button>
      </footer>
    </div>
  );
}
