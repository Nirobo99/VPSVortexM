"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { LanguageSwitcher } from "@/components/auth/AuthLayout";
import { Avatar, Button } from "@/components/ui";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", key: "dashboard", icon: "🏠" },
  { href: "/chats", key: "chats", icon: "💬" },
  { href: "/channels", key: "channels", icon: "📢" },
  { href: "/groups", key: "groups", icon: "👥" },
  { href: "/wallet", key: "wallet", icon: "💳" },
  { href: "/profile", key: "profile", icon: "👤" },
  { href: "/settings", key: "settings", icon: "⚙️" },
  { href: "/admin/login", key: "admin", icon: "🛡️", adminOnly: true },
] as const;

function navActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">...</div>
      </div>
    );
  }

  if (!user) return null;

  const navItems = NAV.filter((item) => !("adminOnly" in item) || user.has_admin_panel);
  const displayName = user.display_name || user.username;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between sticky top-[var(--dev-notice-offset,0px)] bg-background/95 backdrop-blur z-40">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="p-2 rounded-lg hover:bg-muted lg:hidden"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Menu"
          >
            <span className="text-xl">{menuOpen ? "✕" : "☰"}</span>
          </button>
          <Link href="/dashboard" className="text-xl font-bold text-primary">
            {t("app.name")}
          </Link>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/profile"
            className="flex items-center gap-2 rounded-lg border border-transparent hover:border-border hover:bg-muted/50 px-1.5 py-1 transition-colors"
            title={displayName}
          >
            <Avatar src={user.avatar_url} name={displayName} className="h-8 w-8 sm:h-9 sm:w-9" />
            <span className="hidden md:inline text-sm font-medium truncate max-w-[120px]">{displayName}</span>
          </Link>
          <LanguageSwitcher />
          <Button variant="outline" size="sm" onClick={logout}>
            {t("nav.logout")}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 relative">
        <aside
          className={cn(
            "fixed lg:static inset-y-0 left-0 z-20 w-64 border-r border-border bg-background/98 backdrop-blur pt-16 lg:pt-0 transition-transform duration-200",
            menuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          )}
        >
          <nav className="p-3 space-y-1">
            {navItems.map(({ href, key, icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  navActive(pathname, href)
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <span>{icon}</span>
                <span className="flex-1">{t(`nav.${key}`)}</span>
                {key === "wallet" && (
                  <span className="text-xs font-semibold text-primary tabular-nums">
                    {user.wallet_balance.toLocaleString()} ₽
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </aside>

        {menuOpen && (
          <button
            type="button"
            className="fixed inset-0 bg-black/40 z-10 lg:hidden"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          />
        )}

        <main className="flex-1 p-4 sm:p-6 max-w-5xl w-full mx-auto">{children}</main>
      </div>

      <footer className="text-center text-xs text-muted-foreground py-2 border-t border-border">
        <button type="button" className="hover:text-foreground" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }))}>
          {t("hotkeys.title")} (?)
        </button>
      </footer>
    </div>
  );
}
