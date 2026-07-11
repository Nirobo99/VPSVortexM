"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

function isTypingTarget(target: EventTarget | null) {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function useHotkeys(onShowHelp: (open?: boolean) => void) {
  const router = useRouter();
  const { user } = useAuth();

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) {
        if (e.key === "Escape") {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        onShowHelp();
        return;
      }

      if (e.key === "Escape") {
        onShowHelp(false);
        return;
      }

      if (!user) return;

      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const routes: Record<string, string> = {
          "1": "/dashboard",
          "2": "/chats",
          "3": "/channels",
          "4": "/wallet",
          "5": "/profile",
          "6": "/settings",
        };
        if (user.role === "admin" || user.role === "superadmin") {
          routes["7"] = "/admin/login";
        }
        const path = routes[e.key];
        if (path) {
          e.preventDefault();
          router.push(path);
        }
      }
    },
    [user, router, onShowHelp]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);
}
