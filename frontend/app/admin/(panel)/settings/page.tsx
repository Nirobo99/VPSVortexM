"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminApi } from "@/lib/adminApi";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button, Card, CardContent } from "@/components/ui";

export default function AdminSettingsPage() {
  const { t } = useTranslation();
  const { can } = useAdminAuth();
  const [settings, setSettings] = useState<Record<string, unknown>>({});

  useEffect(() => {
    adminApi.settings().then(setSettings);
  }, []);

  const toggle = async (key: string, value: boolean) => {
    await adminApi.updateSettings({ [key]: value });
    adminApi.settings().then(setSettings);
  };

  const toggles = [
    ["project_enabled", t("admin.project_enabled")],
    ["registration_enabled", t("admin.registration_enabled")],
    ["maintenance_mode", t("adminPanel.maintenance")],
  ] as const;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">{t("adminPanel.settings")}</h1>
      <Card>
        <CardContent className="pt-4 space-y-4">
          {toggles.map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-4">
              <span className="text-sm">{label}</span>
              <input
                type="checkbox"
                checked={Boolean(settings[key])}
                disabled={!can("settings", "edit")}
                onChange={(e) => toggle(key, e.target.checked)}
              />
            </label>
          ))}
          <p className="text-sm text-muted-foreground">{t("adminPanel.projectName")}: {String(settings.project_name || "VortexM")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
