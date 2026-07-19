"use client";

import { usePathname } from "next/navigation";
import { CircleNav } from "@/components/CircleNav";
import { useAuth } from "@/hooks/useAuth";
import { isAdminUser } from "@/lib/profileDisplay";

const HIDDEN_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify",
  "/admin",
];

function shouldHide(pathname: string) {
  if (pathname === "/") return true;
  return HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Mounts CircleNav on authenticated app pages (and a login FAB on public app pages).
 * Skips landing / auth / admin-login screens.
 */
export function CircleNavHost() {
  const pathname = usePathname() || "/";
  const { user, loading } = useAuth();

  if (loading || shouldHide(pathname)) return null;

  return (
    <CircleNav
      activePath={pathname}
      isAuthenticated={!!user}
      isAdmin={!!user && isAdminUser(user)}
    />
  );
}
