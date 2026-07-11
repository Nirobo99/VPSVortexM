"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { adminApi } from "@/lib/adminApi";
import { ActivityChart } from "@/components/admin/ActivityChart";
import { Card, CardContent } from "@/components/ui";

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    adminApi.dashboard().then(setData).catch(() => {});
  }, []);

  if (!data) return <div className="animate-pulse">...</div>;

  const chart = (data.activity_chart as { date: string; messages: number }[]) || [];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">{t("adminPanel.dashboard")}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        {[
          [t("adminPanel.usersTotal"), data.users_total],
          [t("adminPanel.usersActiveToday"), data.users_active_today],
          [t("adminPanel.usersNewWeek"), data.users_new_week],
          [t("adminPanel.revenueToday"), `${data.revenue_today} ₽`],
          [t("adminPanel.revenueWeek"), `${data.revenue_week} ₽`],
          [t("adminPanel.complaintsNew"), data.complaints_new],
        ].map(([label, val]) => (
          <Card key={String(label)}>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">{String(label)}</p>
              <p className="text-2xl font-bold">{String(val)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-6">
        <CardContent className="pt-4">
          <h2 className="font-medium mb-4">{t("adminPanel.activityChart")}</h2>
          <ActivityChart data={chart} messagesLabel={t("adminPanel.messages")} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link href="/admin/users" className="px-4 py-2 rounded-md bg-muted text-sm hover:bg-muted/80">{t("adminPanel.users")}</Link>
        <Link href="/admin/complaints" className="px-4 py-2 rounded-md bg-muted text-sm hover:bg-muted/80">{t("adminPanel.complaints")}</Link>
        <Link href="/admin/finance" className="px-4 py-2 rounded-md bg-muted text-sm hover:bg-muted/80">{t("adminPanel.finance")}</Link>
      </div>
    </div>
  );
}
