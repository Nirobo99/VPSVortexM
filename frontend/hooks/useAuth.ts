"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, clearTokens, getAccessToken, saveTokens } from "@/lib/api";
import type { UserMe } from "@/lib/api";

export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<UserMe | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const me = await api.getMe();
      setUser(me);
    } catch {
      const refresh = localStorage.getItem("refresh_token");
      if (refresh) {
        try {
          const tokens = await api.refresh(refresh);
          saveTokens(tokens);
          const me = await api.getMe();
          setUser(me);
        } catch {
          clearTokens();
          setUser(null);
        }
      } else {
        clearTokens();
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const interval = setInterval(async () => {
      const refresh = localStorage.getItem("refresh_token");
      if (!refresh) return;
      try {
        const tokens = await api.refresh(refresh);
        saveTokens(tokens);
      } catch {
        /* will retry on next API call */
      }
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  const logout = async () => {
    const refresh = localStorage.getItem("refresh_token");
    if (refresh) {
      try {
        await api.logout(refresh);
      } catch {
        /* ignore */
      }
    }
    clearTokens();
    setUser(null);
    router.push("/login");
  };

  return { user, loading, logout, reload: loadUser };
}
