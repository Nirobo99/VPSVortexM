"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { applyTheme, storeTheme } from "@/lib/theme";
import {
  Alert,
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

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
      <span className="text-sm">{label}</span>
      <input
        type="checkbox"
        className="h-4 w-4 accent-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user, loading, reload } = useAuth();
  const [themeMode, setThemeMode] = useState("dark");
  const [themePrimary, setThemePrimary] = useState("#7c3aed");
  const [themeAccent, setThemeAccent] = useState("#a855f7");
  const [locale, setLocale] = useState("ru");
  const [notifyMessages, setNotifyMessages] = useState(true);
  const [notifyCalls, setNotifyCalls] = useState(true);
  const [notifyChannels, setNotifyChannels] = useState(true);
  const [notifySound, setNotifySound] = useState(true);
  const [autoClearHours, setAutoClearHours] = useState<string>("");
  const [chatAppearance, setChatAppearance] = useState("default");
  const [preferEncrypted, setPreferEncrypted] = useState(false);
  const [callsAudio, setCallsAudio] = useState(true);
  const [callsVideo, setCallsVideo] = useState(true);
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
    setNotifyMessages(user.notify_messages ?? true);
    setNotifyCalls(user.notify_calls ?? true);
    setNotifyChannels(user.notify_channels ?? true);
    setNotifySound(user.notify_sound ?? true);
    setAutoClearHours(user.chat_auto_clear_hours ? String(user.chat_auto_clear_hours) : "");
    setChatAppearance(user.chat_appearance || "default");
    setPreferEncrypted(user.prefer_encrypted_chats ?? false);
    setCallsAudio(user.calls_audio_enabled ?? true);
    setCallsVideo(user.calls_video_enabled ?? true);
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

  const saveNotifications = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.updateProfile({
        notify_messages: notifyMessages,
        notify_calls: notifyCalls,
        notify_channels: notifyChannels,
        notify_sound: notifySound,
      });
      await reload();
      setMessage({ type: "ok", text: t("settings.notificationsSaved") });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : t("auth.error") });
    } finally {
      setSaving(false);
    }
  };

  const saveChatPrefs = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.updateProfile({
        chat_auto_clear_hours: autoClearHours ? Number(autoClearHours) : null,
        chat_appearance: chatAppearance,
        prefer_encrypted_chats: preferEncrypted,
        calls_audio_enabled: callsAudio,
        calls_video_enabled: callsVideo,
      });
      localStorage.setItem("vortexm_chat_appearance", chatAppearance);
      await reload();
      setMessage({ type: "ok", text: t("settings.chatPrefsSaved") });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : t("auth.error") });
    } finally {
      setSaving(false);
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
            <Select value={themeMode} onChange={(e) => setThemeMode(e.target.value)}>
              <option value="dark">{t("settings.dark")}</option>
              <option value="light">{t("settings.light")}</option>
              <option value="custom">{t("settings.custom")}</option>
            </Select>
            {themeMode === "custom" && (
              <div className="flex gap-4">
                <Input
                  type="color"
                  value={themePrimary}
                  onChange={(e) => setThemePrimary(e.target.value)}
                  className="h-10 w-20"
                />
                <Input
                  type="color"
                  value={themeAccent}
                  onChange={(e) => setThemeAccent(e.target.value)}
                  className="h-10 w-20"
                />
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
            <CardTitle>{t("settings.notifications")}</CardTitle>
            <CardDescription>{t("settings.notificationsHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 max-w-md">
            <ToggleRow
              label={t("settings.notifyMessages")}
              checked={notifyMessages}
              onChange={setNotifyMessages}
            />
            <ToggleRow label={t("settings.notifyCalls")} checked={notifyCalls} onChange={setNotifyCalls} />
            <ToggleRow
              label={t("settings.notifyChannels")}
              checked={notifyChannels}
              onChange={setNotifyChannels}
            />
            <ToggleRow label={t("settings.notifySound")} checked={notifySound} onChange={setNotifySound} />
            <Button className="mt-3" onClick={saveNotifications} disabled={saving}>
              {t("settings.saveNotifications")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.personalChats")}</CardTitle>
            <CardDescription>{t("settings.personalChatsHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md">
            <div>
              <Label>{t("settings.autoClear")}</Label>
              <Select value={autoClearHours} onChange={(e) => setAutoClearHours(e.target.value)}>
                <option value="">{t("settings.autoClearOff")}</option>
                <option value="24">{t("settings.autoClearHours", { hours: 24 })}</option>
                <option value="48">{t("settings.autoClearHours", { hours: 48 })}</option>
                <option value="72">{t("settings.autoClearHours", { hours: 72 })}</option>
                <option value="168">{t("settings.autoClearHours", { hours: 168 })}</option>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">{t("settings.autoClearHint")}</p>
            </div>

            <div>
              <Label>{t("settings.chatAppearance")}</Label>
              <Select value={chatAppearance} onChange={(e) => setChatAppearance(e.target.value)}>
                <option value="default">{t("settings.appearanceDefault")}</option>
                <option value="compact">{t("settings.appearanceCompact")}</option>
                <option value="bubbles">{t("settings.appearanceBubbles")}</option>
              </Select>
            </div>

            <ToggleRow
              label={t("settings.preferEncrypted")}
              checked={preferEncrypted}
              onChange={setPreferEncrypted}
            />
            <p className="text-xs text-muted-foreground -mt-2">{t("settings.preferEncryptedHint")}</p>

            <ToggleRow
              label={t("settings.callsAudio")}
              checked={callsAudio}
              onChange={setCallsAudio}
            />
            <ToggleRow
              label={t("settings.callsVideo")}
              checked={callsVideo}
              onChange={setCallsVideo}
            />

            <Button onClick={saveChatPrefs} disabled={saving}>
              {t("settings.saveChatPrefs")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
