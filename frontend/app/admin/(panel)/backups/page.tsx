"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminApi } from "@/lib/adminApi";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button, Card, CardContent } from "@/components/ui";

export default function AdminBackupsPage() {
  const { t } = useTranslation();
  const { can } = useAdminAuth();
  const [backups, setBackups] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => adminApi.backups().then(setBackups);
  useEffect(() => { load(); }, []);

  const create = async () => {
    setLoading(true);
    try {
      await adminApi.createBackup();
      load();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">{t("adminPanel.backups")}</h1>
      {can("backups", "create") && (
        <Button className="mb-4" onClick={create} disabled={loading}>{t("adminPanel.createBackup")}</Button>
      )}
      <div className="space-y-2">
        {backups.map((b) => (
          <Card key={String(b.id)}>
            <CardContent className="py-3 flex justify-between text-sm">
              <span>{String(b.filename || b.id)} · {String(b.status)}</span>
              <span className="text-muted-foreground">{String(b.created_at)}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
