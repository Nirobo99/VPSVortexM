"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { api, type PublicProfile, type Story } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { LanguageSwitcher } from "@/components/auth/AuthLayout";
import { Alert, Avatar, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export default function PublicProfilePage() {
  const { t } = useTranslation();
  const params = useParams();
  const username = decodeURIComponent(params.username as string);
  const { user } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [reporting, setReporting] = useState(false);

  const reportUser = async () => {
    if (!profile || !user) return;
    const reason = prompt(t("admin.reportReason"));
    if (!reason || reason.length < 5) return;
    setReporting(true);
    try {
      await api.submitComplaint("user", profile.id, reason);
      alert(t("admin.reportSent"));
    } catch (e) {
      alert(e instanceof Error ? e.message : t("auth.error"));
    } finally {
      setReporting(false);
    }
  };

  useEffect(() => {
    api
      .getPublicProfile(username)
      .then((p) => {
        setProfile(p);
        return api.getUserStories(username);
      })
      .then(setStories)
      .catch((e) => setError(e.message));
  }, [username]);

  const blockUser = async () => {
    if (!profile || !user) return;
    setBlocking(true);
    try {
      await api.blockUser(profile.id);
      setError(t("profile.userBlocked"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.error"));
    } finally {
      setBlocking(false);
    }
  };

  const isOwn = user?.username === username;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between">
        <Link href={user ? "/dashboard" : "/"} className="text-xl font-bold text-primary">
          {t("app.name")}
        </Link>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          {user ? (
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                {t("nav.dashboard")}
              </Button>
            </Link>
          ) : (
            <Link href="/login">
              <Button size="sm">{t("nav.login")}</Button>
            </Link>
          )}
        </div>
      </header>

      <main className="p-6 max-w-lg mx-auto">
        {error && !profile && (
          <Alert variant="destructive">{error}</Alert>
        )}

        {profile && (
          <Card>
            <CardHeader className="items-center text-center">
              <Avatar
                src={profile.avatar_url}
                name={profile.display_name || profile.username}
                className="h-24 w-24 text-2xl mx-auto mb-3"
              />
              <CardTitle className="flex items-center justify-center gap-2">
                {profile.display_name || profile.username}
                {profile.is_verified && <span className="text-primary text-sm">✓</span>}
              </CardTitle>
              <p className="text-muted-foreground">@{profile.username}</p>
              {(profile.status_emoji || profile.status_text) && (
                <p className="text-sm mt-1">
                  {profile.status_emoji} {profile.status_text}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {t("profile.level")} {profile.level}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {profile.bio && <p className="text-sm text-center">{profile.bio}</p>}

              {stories.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-2">{t("profile.stories")}</h3>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {stories.map((story) => (
                      <div key={story.id} className="shrink-0 w-24 h-32 border border-primary rounded-lg overflow-hidden">
                        {story.media_url && story.media_type === "image" ? (
                          <img src={story.media_url} alt="" className="w-full h-full object-cover" />
                        ) : story.text ? (
                          <p className="text-xs p-2">{story.text}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                {isOwn && (
                  <Link href="/profile">
                    <Button className="w-full">{t("profile.editProfile")}</Button>
                  </Link>
                )}
                {user && !isOwn && (
                  <>
                    <Button variant="destructive" onClick={blockUser} disabled={blocking}>
                      {t("settings.block")}
                    </Button>
                    <Button variant="outline" onClick={reportUser} disabled={reporting}>
                      {t("admin.report")}
                    </Button>
                  </>
                )}
                {!user && (
                  <Link href="/login">
                    <Button className="w-full">{t("profile.loginToContact")}</Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
