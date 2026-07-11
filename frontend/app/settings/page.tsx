"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
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
  const [totpCode, setTotpCode] = useState("");
  const [twoFaSetup, setTwoFaSetup] = useState<{ secret: string; provisioning_uri: string } | null>(null);
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
    api.getBlocks().then(setBlocks).catch(() => {});
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

  const start2FA = async () => {
    try {
      const setup = await api.setup2FA();
      setTwoFaSetup(setup);
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : t("auth.error") });
    }
  };

  const enable2FA = async () => {
    if (!totpCode) return;
    setSaving(true);
    try {
      await api.enable2FA(totpCode);
      setTwoFaSetup(null);
      setTotpCode("");
      await reload();
      setMessage({ type: "ok", text: t("settings.twoFaEnabled") });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : t("auth.error") });
    } finally {
      setSaving(false);
    }
  };

  const disable2FA = async () => {
    if (!totpCode) return;
    setSaving(true);
    try {
      await api.disable2FA(totpCode);
      setTotpCode("");
      await reload();
      setMessage({ type: "ok", text: t("settings.twoFaDisabled") });
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
            <CardTitle>{t("settings.theme")}</CardTitle>
            <CardDescription>{t("settings.themeHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md">
            <div>
              <Label>{t("settings.themeMode")}</Label>
              <Select value={themeMode} onChange={(e) => setThemeMode(e.target.value)}>
                <option value="dark">{t("settings.dark")}</option>
                <option value="light">{t("settings.light")}</option>
                <option value="custom">{t("settings.custom")}</option>
              </Select>
            </div>
            {themeMode === "custom" && (
              <div className="flex gap-4">
                <div>
                  <Label>{t("settings.primaryColor")}</Label>
                  <Input type="color" value={themePrimary} onChange={(e) => setThemePrimary(e.target.value)} className="h-10 w-20" />
                </div>
                <div>
                  <Label>{t("settings.accentColor")}</Label>
                  <Input type="color" value={themeAccent} onChange={(e) => setThemeAccent(e.target.value)} className="h-10 w-20" />
                </div>
              </div>
            )}
            <Button onClick={saveTheme} disabled={saving}>
              {t("settings.saveTheme")}
            </Button>
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
            <Button variant="outline" onClick={saveLocale}>
              {t("settings.saveLocale")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.twoFa")}</CardTitle>
            <CardDescription>
              {user.totp_enabled ? t("settings.twoFaOn") : t("settings.twoFaOff")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md">
            {!user.totp_enabled && !twoFaSetup && (
              <Button onClick={start2FA}>{t("settings.setupTwoFa")}</Button>
            )}
            {twoFaSetup && (
              <div className="space-y-3">
                <QRCodeSVG value={twoFaSetup.provisioning_uri} size={160} />
                <p className="text-xs font-mono break-all">{twoFaSetup.secret}</p>
                <Input
                  placeholder={t("auth.totpCode")}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                />
                <Button onClick={enable2FA} disabled={saving}>
                  {t("settings.enableTwoFa")}
                </Button>
              </div>
            )}
            {user.totp_enabled && (
              <div className="space-y-3">
                <Input
                  placeholder={t("auth.totpCode")}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                />
                <Button variant="destructive" onClick={disable2FA} disabled={saving}>
                  {t("settings.disableTwoFa")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.blocklist")}</CardTitle>
            <CardDescription>{t("settings.blocklistHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 max-w-md">
              <Input
                placeholder={t("settings.blockUsername")}
                value={blockUsername}
                onChange={(e) => setBlockUsername(e.target.value)}
              />
              <Button onClick={blockByUsername} disabled={saving}>
                {t("settings.block")}
              </Button>
            </div>
            <div className="space-y-2">
              {blocks.map((b) => (
                <div key={b.id} className="flex items-center justify-between p-2 border border-border rounded-md">
                  <div className="flex items-center gap-2">
                    <Avatar src={b.avatar_url} name={b.display_name || b.username} className="h-8 w-8 text-xs" />
                    <span className="text-sm">@{b.username}</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => unblock(b.id)}>
                    {t("settings.unblock")}
                  </Button>
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
