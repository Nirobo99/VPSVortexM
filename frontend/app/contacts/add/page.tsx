"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { api, type PublicProfile } from "@/lib/api";
import { DisplayNameWithBadge } from "@/components/profile/DisplayNameWithBadge";
import { useAuth } from "@/hooks/useAuth";
import { LanguageSwitcher } from "@/components/auth/AuthLayout";
import { Alert, Avatar, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

function AddContactContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();
  const username = searchParams.get("user");
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) {
      setError(t("contacts.noUser"));
      return;
    }
    api
      .getPublicProfile(username)
      .then(setProfile)
      .catch((e) => setError(e.message));
  }, [username, t]);

  if (!username) {
    return <Alert variant="destructive">{t("contacts.noUser")}</Alert>;
  }

  return (
    <>
      {error && !profile && <Alert variant="destructive">{error}</Alert>}

      {profile && (
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle>{t("contacts.addTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center gap-2">
              <Avatar
                src={profile.avatar_url}
                name={profile.display_name || profile.username}
                className="h-20 w-20 text-lg"
              />
              <p className="font-medium">
                <DisplayNameWithBadge
                  name={profile.display_name || profile.username}
                  verified={profile.is_official_verified}
                  highlighted={profile.display_name_highlighted}
                />
              </p>
              <p className="text-sm text-muted-foreground">@{profile.username}</p>
            </div>

            {!loading && !user && (
              <>
                <p className="text-sm text-center text-muted-foreground">{t("contacts.loginRequired")}</p>
                <Link href={`/login?redirect=/contacts/add?user=${encodeURIComponent(username)}`}>
                  <Button className="w-full">{t("nav.login")}</Button>
                </Link>
              </>
            )}

            {user && (
              <>
                <p className="text-sm text-center text-muted-foreground">{t("contacts.hint")}</p>
                <Button
                  className="w-full"
                  onClick={async () => {
                    try {
                      const dialog = await api.createDialog(profile.username);
                      router.push(`/chats/${dialog.id}`);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : t("auth.error"));
                    }
                  }}
                >
                  {t("chats.openChat")}
                </Button>
                <Link href={`/users/${profile.username}`}>
                  <Button variant="outline" className="w-full mt-2">{t("contacts.viewProfile")}</Button>
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}

export default function AddContactPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <Suspense fallback={<div className="animate-pulse text-muted-foreground">...</div>}>
        <AddContactContent />
      </Suspense>
    </div>
  );
}
