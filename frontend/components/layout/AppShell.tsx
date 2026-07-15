"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { LanguageSwitcher } from "@/components/auth/AuthLayout";
import { DisplayNameWithBadge } from "@/components/profile/DisplayNameWithBadge";
import { Avatar, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { isAdminUser } from "@/lib/profileDisplay";

const NAV = [
  { href: "/dashboard", key: "dashboard" },
  { href: "/messages", key: "messages" },
  { href: "/wallet", key: "wallet" },
  { href: "/profile", key: "profile" },
  { href: "/settings", key: "settings" },
  { href: "/admin/login", key: "admin", adminOnly: true },
] as const;

/** Hide menu after this many ms without interaction */
const MENU_IDLE_MS = 3500;

function navActive(pathname: string, href: string) {
  if (href === "/messages") {
    return (
      pathname === "/messages" ||
      pathname.startsWith("/chats") ||
      pathname.startsWith("/channels") ||
      pathname.startsWith("/groups")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearIdleTimer = useCallback(() => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearIdleTimer();
    idleTimer.current = setTimeout(() => setMenuOpen(false), MENU_IDLE_MS);
  }, [clearIdleTimer]);

  const closeMenu = useCallback(() => {
    clearIdleTimer();
    setMenuOpen(false);
  }, [clearIdleTimer]);

  const toggleMenu = useCallback(() => {
    setMenuOpen((open) => {
      if (open) {
        clearIdleTimer();
        return false;
      }
      scheduleHide();
      return true;
    });
  }, [clearIdleTimer, scheduleHide]);

  const bumpIdle = useCallback(() => {
    if (menuOpen) scheduleHide();
  }, [menuOpen, scheduleHide]);

  useEffect(() => {
    return () => clearIdleTimer();
  }, [clearIdleTimer]);

  useEffect(() => {
    closeMenu();
  }, [pathname, closeMenu]);

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
            className="p-2 rounded-lg hover:bg-muted"
            onClick={toggleMenu}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            <span className="block w-5 space-y-1" aria-hidden>
              <span className={cn("block h-0.5 bg-foreground transition-transform", menuOpen && "translate-y-1.5 rotate-45")} />
              <span className={cn("block h-0.5 bg-foreground transition-opacity", menuOpen && "opacity-0")} />
              <span className={cn("block h-0.5 bg-foreground transition-transform", menuOpen && "-translate-y-1.5 -rotate-45")} />
            </span>
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
          <Button variant="outline" size="sm" onClick={logout}>
            {t("nav.logout")}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 relative">
        <aside
          onMouseEnter={clearIdleTimer}
          onMouseLeave={() => {
            if (menuOpen) scheduleHide();
          }}
          onFocusCapture={clearIdleTimer}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              scheduleHide();
            }
          }}
          onPointerDown={bumpIdle}
          className={cn(
            "fixed left-0 z-30 w-64 max-w-[85vw] border-r border-border bg-background/98 backdrop-blur shadow-xl",
            "top-[calc(var(--dev-notice-offset,0px)+3.5rem)] bottom-0",
            "transition-transform duration-200 ease-out",
            menuOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
          )}
        >
          <nav className="p-3 space-y-1 overflow-y-auto h-full">
            {navItems.map(({ href, key }) => (
              <Link
                key={href}
                href={href}
                onClick={closeMenu}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  navActive(pathname, href)
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
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
            className="fixed inset-0 z-20 bg-black/35"
            style={{ top: "calc(var(--dev-notice-offset, 0px) + 3.5rem)" }}
            onClick={closeMenu}
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
