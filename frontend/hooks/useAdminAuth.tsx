"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCaptchaToken } from "@/lib/captcha";
import {
  adminApi,
  clearAdminTokens,
  getAdminToken,
  saveCsrfToken,
  saveAdminTokens,
  type AdminUser,
} from "@/lib/adminApi";

interface AdminAuthContextValue {
  admin: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string, totp?: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  can: (resource: string, action: string) => boolean;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!getAdminToken()) {
      setAdmin(null);
      setLoading(false);
      return;
    }
    try {
      const me = await adminApi.me();
      setAdmin(me);
    } catch {
      clearAdminTokens();
      setAdmin(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const login = async (email: string, password: string, totp?: string) => {
    const captchaToken = await getCaptchaToken("admin_login");
    const res = await adminApi.login(email, password, totp, captchaToken);
    saveAdminTokens(res.access_token, res.refresh_token);
    const csrf = await adminApi.csrf();
    saveCsrfToken(csrf.csrf_token);
    setAdmin(res.admin);
    router.push("/admin");
  };

  const logout = async () => {
    try {
      await adminApi.logout();
    } catch {
      /* ignore */
    }
    clearAdminTokens();
    setAdmin(null);
    router.push("/admin/login");
  };

  const can = (resource: string, action: string) => {
    if (!admin) return false;
    const p = admin.permissions;
    if (p.includes("*")) return true;
    if (p.includes(`${resource}:*`)) return true;
    return p.includes(`${resource}:${action}`);
  };

  return (
    <AdminAuthContext.Provider value={{ admin, loading, login, logout, reload, can }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
