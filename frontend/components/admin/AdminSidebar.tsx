"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin", key: "dashboard", resource: "dashboard", action: "view", exact: true },
  { href: "/admin/users", key: "users", resource: "users", action: "view" },
  { href: "/admin/channels", key: "channels", resource: "channels", action: "view" },
  { href: "/admin/complaints", key: "complaints", resource: "complaints", action: "view" },
  { href: "/admin/ads", key: "ads", resource: "ads", action: "view" },
  { href: "/admin/broadcasts", key: "broadcasts", resource: "broadcasts", action: "view" },
  { href: "/admin/pages", key: "pages", resource: "pages", action: "view" },
  { href: "/admin/finance", key: "finance", resource: "finance", action: "view" },
  { href: "/admin/settings", key: "settings", resource: "settings", action: "view" },
  { href: "/admin/logs", key: "logs", resource: "logs", action: "view" },
  { href: "/admin/backups", key: "backups", resource: "backups", action: "view" },
  { href: "/admin/admins", key: "admins", resource: "admins", action: "view" },
] as const;

export function AdminSidebar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { admin, logout, can } = useAdminAuth();

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-card min-h-screen flex flex-col">
      <div className="p-4 border-b border-border">
        <Link href="/admin" className="text-lg font-bold text-primary">
          VortexM Admin
        </Link>
        {admin && (
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {admin.display_name || admin.username} · {admin.role}
          </p>
        )}
      </div>
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.filter((item) => can(item.resource, item.action)).map((item) => {
          const active = "exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block px-3 py-2 rounded-md text-sm transition-colors",
                active ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {t(`adminPanel.${item.key}`)}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-border space-y-2">
        <Link
          href="/admin/security"
          className={cn(
            "block px-2 py-1.5 rounded-md text-xs transition-colors",
            pathname === "/admin/security" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t("adminPanel.security")}
          {admin?.totp_enabled ? " ✓" : ""}
        </Link>
        <Link href="/dashboard" className="block text-xs text-muted-foreground hover:text-foreground">
          ← {t("nav.dashboard")}
        </Link>
        <button type="button" onClick={logout} className="text-xs text-destructive hover:underline">
          {t("nav.logout")}
        </button>
      </div>
    </aside>
  );
}
