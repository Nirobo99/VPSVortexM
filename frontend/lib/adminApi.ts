import type { ChannelVerificationRequest, VerificationRequest } from "./api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export interface AdminUser {
  id: string;
  user_id: string;
  email: string;
  username: string;
  display_name: string | null;
  role: string;
  permissions: string[];
  totp_enabled: boolean;
  is_superadmin: boolean;
}

export interface AdminLoginResult {
  access_token: string;
  refresh_token: string;
  token_type: string;
  admin: AdminUser;
}

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("admin_access_token");
}

function getAdminRefresh(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("admin_refresh_token");
}

export function saveAdminTokens(access: string, refresh: string) {
  sessionStorage.setItem("admin_access_token", access);
  sessionStorage.setItem("admin_refresh_token", refresh);
}

export function saveCsrfToken(csrf: string) {
  localStorage.setItem("csrf_token", csrf);
}

export function clearAdminTokens() {
  sessionStorage.removeItem("admin_access_token");
  sessionStorage.removeItem("admin_refresh_token");
}

export function hasPermission(perms: string[], resource: string, action: string): boolean {
  if (perms.includes("*")) return true;
  if (perms.includes(`${resource}:*`)) return true;
  return perms.includes(`${resource}:${action}`);
}

async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (typeof window !== "undefined") {
    const csrf = localStorage.getItem("csrf_token");
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  let res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && getAdminRefresh()) {
    const refreshRes = await fetch(`${API_URL}/admin/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ refresh_token: getAdminRefresh() }),
    });
    if (refreshRes.ok) {
      const data = await refreshRes.json();
      if (data.access_token) {
        sessionStorage.setItem("admin_access_token", data.access_token);
        headers.Authorization = `Bearer ${data.access_token}`;
        res = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: "include" });
      }
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const adminApi = {
  csrf() {
    return fetch(`${API_URL.replace(/\/$/, "")}/csrf`, { credentials: "include" }).then((r) => r.json() as Promise<{ csrf_token: string }>);
  },
  login(email: string, password: string, totpCode?: string, captchaToken?: string | null) {
    return adminRequest<AdminLoginResult>("/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, totp_code: totpCode || null, captcha_token: captchaToken || null }),
    });
  },
  logout() {
    return adminRequest("/admin/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: getAdminRefresh() }),
    });
  },
  me() {
    return adminRequest<AdminUser>("/admin/auth/me");
  },
  setup2FA() {
    return adminRequest<{ secret: string; uri: string }>("/admin/auth/2fa/setup", { method: "POST" });
  },
  enable2FA(code: string) {
    return adminRequest("/admin/auth/2fa/enable", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  },
  dashboard() {
    return adminRequest<Record<string, unknown>>("/admin/dashboard");
  },
  users(params?: { q?: string; verified?: boolean; banned?: boolean; page?: number }) {
    const sp = new URLSearchParams();
    if (params?.q) sp.set("q", params.q);
    if (params?.verified !== undefined) sp.set("verified", String(params.verified));
    if (params?.banned !== undefined) sp.set("banned", String(params.banned));
    if (params?.page) sp.set("page", String(params.page));
    return adminRequest<{ users: Record<string, unknown>[]; total: number }>(`/admin/users?${sp}`);
  },
  getUser(id: string) {
    return adminRequest<Record<string, unknown>>(`/admin/users/${id}`);
  },
  banUser(id: string) {
    return adminRequest(`/admin/users/${id}/ban`, { method: "POST" });
  },
  unbanUser(id: string) {
    return adminRequest(`/admin/users/${id}/unban`, { method: "POST" });
  },
  verifyUser(id: string, verified: boolean) {
    return adminRequest(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_official_verified: verified }),
    });
  },
  listVerificationRequests(status?: string) {
    return adminRequest<VerificationRequest[]>(
      `/admin/verification${status ? `?status=${status}` : ""}`
    );
  },
  reviewVerificationRequest(id: string, approve: boolean, adminNote?: string) {
    return adminRequest(`/admin/verification/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ approve, admin_note: adminNote || null }),
    });
  },
  listChannelVerificationRequests(status?: string) {
    return adminRequest<ChannelVerificationRequest[]>(
      `/admin/channel-verification${status ? `?status=${status}` : ""}`
    );
  },
  reviewChannelVerificationRequest(id: string, approve: boolean, adminNote?: string) {
    return adminRequest(`/admin/channel-verification/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ approve, admin_note: adminNote || null }),
    });
  },
  channels(q?: string) {
    return adminRequest<Record<string, unknown>[]>(`/admin/channels${q ? `?q=${q}` : ""}`);
  },
  verifyChannel(slug: string, verified: boolean) {
    return adminRequest(`/admin/channels/${encodeURIComponent(slug)}/verify?verified=${verified}`, { method: "POST" });
  },
  deleteChannel(slug: string) {
    return adminRequest(`/admin/channels/${encodeURIComponent(slug)}`, { method: "DELETE" });
  },
  groups() {
    return adminRequest<Record<string, unknown>[]>("/admin/groups");
  },
  complaints(status?: string) {
    return adminRequest<Record<string, unknown>[]>(`/admin/complaints${status ? `?status=${status}` : ""}`);
  },
  assignComplaint(id: string) {
    return adminRequest(`/admin/complaints/${id}/assign`, { method: "POST" });
  },
  resolveComplaint(id: string, status: string, note?: string) {
    return adminRequest(`/admin/complaints/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ status, admin_note: note }),
    });
  },
  ads() {
    return adminRequest<Record<string, unknown>[]>("/admin/ads");
  },
  createAd(data: Record<string, unknown>) {
    return adminRequest("/admin/ads", { method: "POST", body: JSON.stringify(data) });
  },
  deleteAd(id: string) {
    return adminRequest(`/admin/ads/${id}`, { method: "DELETE" });
  },
  broadcasts() {
    return adminRequest<Record<string, unknown>[]>("/admin/broadcasts");
  },
  createBroadcast(data: Record<string, unknown>) {
    return adminRequest("/admin/broadcasts", { method: "POST", body: JSON.stringify(data) });
  },
  sendBroadcast(id: string) {
    return adminRequest(`/admin/broadcasts/${id}/send`, { method: "POST" });
  },
  pages() {
    return adminRequest<Record<string, unknown>[]>("/admin/pages");
  },
  updatePage(slug: string, title: string, content_html: string) {
    return adminRequest(`/admin/pages/${slug}`, {
      method: "PUT",
      body: JSON.stringify({ title, content_html }),
    });
  },
  settings() {
    return adminRequest<Record<string, unknown>>("/admin/settings");
  },
  updateSettings(data: Record<string, unknown>) {
    return adminRequest("/admin/settings", { method: "PATCH", body: JSON.stringify(data) });
  },
  finance(userId?: string) {
    return adminRequest<{ transactions: Record<string, unknown>[]; total: number }>(
      `/admin/finance${userId ? `?user_id=${userId}` : ""}`
    );
  },
  adjustWallet(userId: string, amount: number, reason: string) {
    return adminRequest(`/admin/finance/users/${userId}/adjust`, {
      method: "POST",
      body: JSON.stringify({ amount, reason }),
    });
  },
  logs() {
    return adminRequest<Record<string, unknown>[]>("/admin/logs");
  },
  backups() {
    return adminRequest<Record<string, unknown>[]>("/admin/backups");
  },
  createBackup() {
    return adminRequest("/admin/backups", { method: "POST" });
  },
  accounts() {
    return adminRequest<Record<string, unknown>[]>("/admin/accounts");
  },
  createAccount(email: string, role: string, permissions?: Record<string, string[]>) {
    return adminRequest("/admin/accounts", {
      method: "POST",
      body: JSON.stringify({ email, role, permissions }),
    });
  },
  updateAccount(id: string, data: Record<string, unknown>) {
    return adminRequest(`/admin/accounts/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  exportUsersCsv() {
    return fetch(`${API_URL}/admin/users/export/csv`, {
      headers: { Authorization: `Bearer ${getAdminToken()}` },
      credentials: "include",
    }).then((r) => r.text());
  },
};
