"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminApi } from "@/lib/adminApi";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button, Card, CardContent } from "@/components/ui";

export default function AdminComplaintsPage() {
  const { t } = useTranslation();
  const { can } = useAdminAuth();
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [status, setStatus] = useState("");

  const load = () => adminApi.complaints(status || undefined).then(setItems);
  useEffect(() => { load(); }, [status]);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">{t("adminPanel.complaints")}</h1>
      <div className="flex gap-2 mb-4">
        {["", "pending", "in_progress", "resolved", "rejected"].map((s) => (
          <Button key={s || "all"} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
            {s || t("adminPanel.all")}
          </Button>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground">{t("admin.noComplaints")}</p>
      ) : (
        <div className="space-y-2">
          {items.map((c) => (
            <Card key={String(c.id)}>
              <CardContent className="py-3">
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="font-medium">{String(c.target_type)} · {String(c.reason)}</p>
                    <p className="text-sm text-muted-foreground">{String(c.status)} · {String(c.created_at)}</p>
                    {Boolean(c.admin_note) && <p className="text-xs mt-1">{String(c.admin_note)}</p>}
                  </div>
                  <div className="flex flex-col gap-1">
                    {can("complaints", "assign") && c.status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => adminApi.assignComplaint(String(c.id)).then(load)}>{t("adminPanel.assign")}</Button>
                    )}
                    {can("complaints", "resolve") && (
                      <>
                        <Button size="sm" onClick={() => adminApi.resolveComplaint(String(c.id), "resolved").then(load)}>{t("admin.resolve")}</Button>
                        <Button size="sm" variant="outline" onClick={() => adminApi.resolveComplaint(String(c.id), "rejected").then(load)}>{t("admin.reject")}</Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
