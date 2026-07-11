"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminApi } from "@/lib/adminApi";
import { Card, CardContent } from "@/components/ui";

export default function AdminLogsPage() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    adminApi.logs().then(setLogs);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">{t("adminPanel.logs")}</h1>
      <div className="space-y-2">
        {logs.map((log) => (
          <Card key={String(log.id)}>
            <CardContent className="py-3 text-sm">
              <p className="font-medium">{String(log.action)} · {String(log.target_type)}</p>
              <p className="text-muted-foreground">{String(log.admin_email || log.admin_id)} · {String(log.ip_address)} · {String(log.created_at)}</p>
              {Boolean(log.details) && <p className="text-xs mt-1 font-mono">{JSON.stringify(log.details)}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
