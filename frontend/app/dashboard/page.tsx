"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { api, type AnnouncementItem } from "@/lib/api";
import { Alert, Avatar, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    api.getActiveAnnouncements().then(setAnnouncements).catch(() => {});
  }, []);

  if (loading || !user) {    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">...</div>
      </div>
    );
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold mb-6">{t("nav.dashboard")}</h1>

      {announcements.map((a) => (
        <Alert key={a.id} className="mb-4">
          <p className="font-medium">{a.title}</p>
          <p className="text-sm mt-1">{a.content}</p>
        </Alert>
      ))}

      <Card className="mb-6">        <CardHeader className="flex flex-row items-center gap-4">
          <Avatar
            src={user.avatar_url}
            name={user.display_name || user.username}
            className="h-14 w-14"
          />
          <div>
            <CardTitle>{user.display_name || user.username}</CardTitle>
            <CardDescription>@{user.username}</CardDescription>
            {user.status_text && (
              <p className="text-sm mt-1 text-muted-foreground">{user.status_text}</p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>{t("profile.level")} {user.level}</span>
            <span>{user.activity_points} {t("profile.points")}</span>
            <span>{user.role}</span>
            {user.totp_enabled && <span className="text-primary">2FA ✓</span>}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/profile">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="text-lg">{t("nav.profile")}</CardTitle>
              <CardDescription>{t("dashboard.profileHint")}</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/settings">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="text-lg">{t("nav.settings")}</CardTitle>
              <CardDescription>{t("dashboard.settingsHint")}</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/chats">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="text-lg">{t("nav.chats")}</CardTitle>
              <CardDescription>{t("dashboard.chatsHint")}</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/channels">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="text-lg">{t("nav.channels")}</CardTitle>
              <CardDescription>{t("dashboard.channelsHint")}</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/wallet">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="text-lg">{t("nav.wallet")}</CardTitle>
              <CardDescription>{t("dashboard.walletHint")}</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        {user.has_admin_panel && (
          <Link href="/admin/login">
            <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
              <CardHeader>
                <CardTitle className="text-lg">{t("nav.admin")}</CardTitle>
                <CardDescription>{t("dashboard.adminHint")}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        )}
      </div>
    </AppShell>
  );
}
