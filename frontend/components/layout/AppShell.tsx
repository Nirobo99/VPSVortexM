"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadSummary } from "@/hooks/useUnreadSummary";
import { LanguageSwitcher } from "@/components/auth/AuthLayout";
import { DisplayNameWithBadge } from "@/components/profile/DisplayNameWithBadge";
import { CircleNav } from "@/components/CircleNav";
import { Avatar, Button } from "@/components/ui";
import { isAdminUser } from "@/lib/profileDisplay";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user, loading, logout } = useAuth();
  const pathname = usePathname() || "/";
  const { summary } = useUnreadSummary(!!user && !loading);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">...</div>
      </div>
    );
  }

  if (!user) return null;

  const displayName = user.display_name || user.username;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between sticky top-[var(--dev-notice-offset,0px)] bg-background/95 backdrop-blur z-40">
        <Link href="/dashboard" className="text-xl font-bold text-primary">
          {t("app.name")}
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/profile"
            className="flex items-center gap-2 rounded-lg border border-transparent hover:border-border hover:bg-muted/50 px-1.5 py-1 transition-colors"
            title={displayName}
          >
            <Avatar
              src={user.avatar_url}
              name={displayName}
              admin={isAdminUser(user)}
              className="h-8 w-8 sm:h-9 sm:w-9"
            />
            <span className="hidden md:inline text-sm font-medium truncate max-w-[140px]">
              <DisplayNameWithBadge name={displayName} verified={user.is_official_verified} />
            </span>
          </Link>
          <LanguageSwitcher />
          <Button variant="outline" size="sm" onClick={logout} className="hidden sm:inline-flex">
            {t("nav.logout")}
          </Button>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 pb-28 max-w-5xl w-full mx-auto">{children}</main>

      <footer className="text-center text-xs text-muted-foreground py-2 pb-24 border-t border-border">
        <button
          type="button"
          className="hover:text-foreground"
          onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }))}
        >
          {t("hotkeys.title")} (?)
        </button>
      </footer>

      <CircleNav
        activePath={pathname}
        isAdmin={isAdminUser(user)}
        messageUnread={summary.total}
        onLogout={logout}
      />
    </div>
  );
}
