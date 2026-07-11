"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminApi } from "@/lib/adminApi";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button, Card, CardContent, Input } from "@/components/ui";

const ROLES = ["admin", "moderator", "support", "content_manager"];

export default function AdminAccountsPage() {
  const { t } = useTranslation();
  const { can, admin } = useAdminAuth();
  const [accounts, setAccounts] = useState<Record<string, unknown>[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("moderator");

  const load = () => adminApi.accounts().then(setAccounts);
  useEffect(() => { load(); }, []);

  const create = async () => {
    await adminApi.createAccount(email, role);
    setEmail("");
    load();
  };

  const deactivate = async (id: string) => {
    await adminApi.updateAccount(id, { is_active: false });
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">{t("adminPanel.admins")}</h1>
      {can("admins", "create") && (
        <Card className="mb-6">
          <CardContent className="pt-4 flex flex-wrap gap-2 items-end">
            <Input placeholder={t("auth.email")} value={email} onChange={(e) => setEmail(e.target.value)} className="max-w-xs" />
            <select className="h-10 rounded-md border border-input px-3 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <Button onClick={create} disabled={!email}>{t("adminPanel.addAdmin")}</Button>
          </CardContent>
        </Card>
      )}
      <div className="space-y-2">
        {accounts.map((a) => (
          <Card key={String(a.id)}>
            <CardContent className="py-3 flex justify-between items-center">
              <div>
                <p className="font-medium">{String(a.email || a.username)} {a.is_superadmin ? "★" : ""}</p>
                <p className="text-sm text-muted-foreground">{String(a.role)} · {a.is_active ? t("adminPanel.active") : t("adminPanel.inactive")}</p>
              </div>
              {can("admins", "edit") && !a.is_superadmin && a.id !== admin?.id && (
                <Button size="sm" variant="destructive" onClick={() => deactivate(String(a.id))}>{t("adminPanel.deactivate")}</Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
