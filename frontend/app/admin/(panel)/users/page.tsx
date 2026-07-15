"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminApi } from "@/lib/adminApi";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button, Card, CardContent, Input } from "@/components/ui";

export default function AdminUsersPage() {
  const { t } = useTranslation();
  const { can } = useAdminAuth();
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);

  const load = () => adminApi.users({ q: q || undefined }).then((r) => setUsers(r.users));

  useEffect(() => { load(); }, []);

  const open = async (id: string) => {
    const u = await adminApi.getUser(id);
    setSelected(u);
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">{t("adminPanel.users")}</h1>
      <div className="flex gap-2 mb-4">
        <Input placeholder={t("admin.searchUsers")} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
        <Button variant="outline" onClick={load}>{t("chats.search")}</Button>
        {can("users", "export") && (
          <Button variant="outline" onClick={() => adminApi.exportUsersCsv().then((csv) => {
            const blob = new Blob([csv], { type: "text/csv" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "users.csv";
            a.click();
          })}>CSV</Button>
        )}
      </div>

      {!selected ? (
        <div className="space-y-2">
          {users.map((u) => (
            <Card key={String(u.id)} className="cursor-pointer hover:border-primary/50" onClick={() => open(String(u.id))}>
              <CardContent className="py-3 flex justify-between">
                <div>
                  <p className="font-medium">{String(u.display_name || u.username)} {u.is_banned === true ? "🚫" : ""}</p>
                  <p className="text-sm text-muted-foreground">@{String(u.username)} · {String(u.email)}</p>
                </div>
                <span className="text-sm">{String(u.wallet_balance)} ₽</span>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>←</Button>
            <p className="font-medium">{String(selected.display_name || selected.username)}</p>
            <p className="text-sm text-muted-foreground">{String(selected.email)} · {String(selected.wallet_balance)} ₽</p>
            <div className="flex flex-wrap gap-2">
              {can("users", "ban") && selected.is_banned !== true && (
                <Button size="sm" variant="destructive" onClick={() => adminApi.banUser(String(selected.id)).then(() => open(String(selected.id)))}>{t("admin.ban")}</Button>
              )}
              {can("users", "unban") && selected.is_banned === true && (
                <Button size="sm" onClick={() => adminApi.unbanUser(String(selected.id)).then(() => open(String(selected.id)))}>{t("admin.unban")}</Button>
              )}
              {can("users", "verify") && (
                <Button size="sm" variant="outline" onClick={() => adminApi.verifyUser(String(selected.id), selected.is_official_verified !== true).then(() => open(String(selected.id)))}>
                  {selected.is_official_verified === true ? t("admin.unverify") : t("admin.verify")}
                </Button>
              )}
            </div>
            {(selected.ip_logs as { ip_address: string; action: string; created_at: string }[])?.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">{t("admin.ipHistory")}</h3>
                {(selected.ip_logs as { ip_address: string; action: string; created_at: string }[]).map((log, i) => (
                  <p key={i} className="text-xs text-muted-foreground">{log.ip_address} · {log.action}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
