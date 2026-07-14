"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { api, type BlockedUser } from "@/lib/api";
import { applyTheme, storeTheme } from "@/lib/theme";
import {
  Alert,
  Avatar,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
} from "@/components/ui";

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user, loading, reload } = useAuth();
  const [themeMode, setThemeMode] = useState("dark");
  const [themePrimary, setThemePrimary] = useState("#7c3aed");
  const [themeAccent, setThemeAccent] = useState("#a855f7");
  const [locale, setLocale] = useState("ru");
  const [blocks, setBlocks] = useState<BlockedUser[]>([]);
  const [blockUsername, setBlockUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [invisibleTime, setInvisibleTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    setThemeMode(user.theme_mode);
    setThemePrimary(user.theme_primary || "#7c3aed");
    setThemeAccent(user.theme_accent || "#a855f7");
    setLocale(user.locale);
    setNewUsername(user.username);
    api.getBlocks().then(setBlocks).catch(() => {});
    api.getProfile().then((p) => {
      if (p.invisible_fake_last_seen) {
        setInvisibleTime(p.invisible_fake_last_seen.slice(0, 16));
      }
    }).catch(() => {});
  }, [user]);

  const saveTheme = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const updated = await api.updateTheme({
        theme_mode: themeMode,
        theme_primary: themeMode === "custom" ? themePrimary : undefined,
        theme_accent: themeMode === "custom" ? themeAccent : undefined,
      });
      const settings = {
        theme_mode: updated.theme_mode,
        theme_primary: updated.theme_primary,
        theme_accent: updated.theme_accent,
      };
      storeTheme(settings);
      applyTheme(settings);
      await reload();
      setMessage({ type: "ok", text: t("settings.themeSaved") });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : t("auth.error") });
    } finally {
      setSaving(false);
    }
  };

  const saveLocale = async () => {
    try {
      await api.updateProfile({ locale });
      i18n.changeLanguage(locale);
      localStorage.setItem("vortexm_locale", locale);
      await reload();
      setMessage({ type: "ok", text: t("settings.localeSaved") });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : t("auth.error") });
    }
  };

  const savePassword = async () => {
    if (!currentPassword || !newPassword) return;
    setSaving(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setMessage({ type: "ok", text: t("settings.passwordChanged") });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : t("auth.error") });
    } finally {
      setSaving(false);
    }
  };

  const saveUsername = async () => {
    if (!newUsername.trim()) return;
    setSaving(true);
    try {
      await api.changeUsername(newUsername.trim());
      await reload();
      setMessage({ type: "ok", text: t("settings.usernameChanged") });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : t("auth.error") });
    } finally {
      setSaving(false);
    }
  };

  const saveInvisibleTime = async () => {
    setSaving(true);
    try {
      await api.updateInvisibleSettings(invisibleTime ? new Date(invisibleTime).toISOString() : null);
      setMessage({ type: "ok", text: t("settings.invisibleSaved") });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : t("auth.error") });
    } finally {
      setSaving(false);
    }
  };

  const blockByUsername = async () => {
    if (!blockUsername.trim()) return;
    setSaving(true);
    try {
      const profile = await api.getPublicProfile(blockUsername.trim());
      await api.blockUser(profile.id);
      const updated = await api.getBlocks();
      setBlocks(updated);
      setBlockUsername("");
      setMessage({ type: "ok", text: t("settings.userBlocked") });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : t("auth.error") });
    } finally {
      setSaving(false);
    }
  };

  const unblock = async (id: string) => {
    try {
      await api.unblockUser(id);
      setBlocks((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : t("auth.error") });
    }
  };

  if (loading || !user) {
    return (
      <AppShell>
        <div className="animate-pulse text-muted-foreground">...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold mb-6">{t("settings.title")}</h1>

      {message && (
        <Alert variant={message.type === "err" ? "destructive" : "default"} className="mb-4">
          {message.text}
        </Alert>
      )}

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.password")}</CardTitle>
            <CardDescription>{t("settings.passwordHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 max-w-md">
            <Input type="password" placeholder={t("settings.currentPassword")} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            <Input type="password" placeholder={t("settings.newPassword")} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <Button onClick={savePassword} disabled={saving}>{t("settings.savePassword")}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.username")}</CardTitle>
            <CardDescription>{t("settings.usernameHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 max-w-md">
            <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
            <Button onClick={saveUsername} disabled={saving}>{t("settings.saveUsername")}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("wallet.invisibleTitle")}</CardTitle>
            <CardDescription>{t("wallet.invisibleHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 max-w-md">
            <div>
              <Label>{t("wallet.invisibleFakeTime")}</Label>
              <Input type="datetime-local" value={invisibleTime} onChange={(e) => setInvisibleTime(e.target.value)} />
            </div>
            <Button variant="outline" onClick={saveInvisibleTime} disabled={saving}>{t("settings.saveInvisible")}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.theme")}</CardTitle>
            <CardDescription>{t("settings.themeHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md">
            <Select value={themeMode} onChange={(e) => setThemeMode(e.target.value)}>
              <option value="dark">{t("settings.dark")}</option>
              <option value="light">{t("settings.light")}</option>
              <option value="custom">{t("settings.custom")}</option>
            </Select>
            {themeMode === "custom" && (
              <div className="flex gap-4">
                <Input type="color" value={themePrimary} onChange={(e) => setThemePrimary(e.target.value)} className="h-10 w-20" />
                <Input type="color" value={themeAccent} onChange={(e) => setThemeAccent(e.target.value)} className="h-10 w-20" />
              </div>
            )}
            <Button onClick={saveTheme} disabled={saving}>{t("settings.saveTheme")}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.language")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-w-md">
            <Select value={locale} onChange={(e) => setLocale(e.target.value)}>
              <option value="ru">{t("lang.ru")}</option>
              <option value="en">{t("lang.en")}</option>
              <option value="fr">{t("lang.fr")}</option>
              <option value="tt">{t("lang.tt")}</option>
              <option value="tg">{t("lang.tg")}</option>
            </Select>
            <Button variant="outline" onClick={saveLocale}>{t("settings.saveLocale")}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.blocklist")}</CardTitle>
            <CardDescription>{t("settings.blocklistHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 max-w-md">
              <Input placeholder={t("settings.blockUsername")} value={blockUsername} onChange={(e) => setBlockUsername(e.target.value)} />
              <Button onClick={blockByUsername} disabled={saving}>{t("settings.block")}</Button>
            </div>
            <div className="space-y-2">
              {blocks.map((b) => (
                <div key={b.id} className="flex items-center justify-between p-2 border border-border rounded-md">
                  <div className="flex items-center gap-2">
                    <Avatar src={b.avatar_url} name={b.display_name || b.username} className="h-8 w-8 text-xs" />
                    <span className="text-sm">@{b.username}</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => unblock(b.id)}>{t("settings.unblock")}</Button>
                </div>
              ))}
              {blocks.length === 0 && <p className="text-sm text-muted-foreground">{t("settings.noBlocks")}</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
