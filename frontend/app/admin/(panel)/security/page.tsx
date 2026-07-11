"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { adminApi } from "@/lib/adminApi";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";

export default function AdminSecurityPage() {
  const { t } = useTranslation();
  const { admin, reload } = useAdminAuth();
  const [twoFaSetup, setTwoFaSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const start2FA = async () => {
    setError(null);
    setSuccess(null);
    try {
      const setup = await adminApi.setup2FA();
      setTwoFaSetup(setup);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  const enable2FA = async () => {
    if (!totpCode) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await adminApi.enable2FA(totpCode);
      setTwoFaSetup(null);
      setTotpCode("");
      setSuccess(t("settings.twoFaEnabled"));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.error"));
    } finally {
      setSaving(false);
    }
  };

  if (!admin) return null;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">{t("adminPanel.security")}</h1>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>{t("settings.twoFa")}</CardTitle>
          <CardDescription>
            {admin.totp_enabled ? t("settings.twoFaOn") : t("settings.twoFaOff")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("adminPanel.twoFaHint")}</p>

          {!admin.totp_enabled && !twoFaSetup && (
            <Button onClick={start2FA}>{t("settings.setupTwoFa")}</Button>
          )}

          {twoFaSetup && (
            <div className="space-y-3">
              <QRCodeSVG value={twoFaSetup.uri} size={180} className="rounded-md border border-border p-2 bg-white" />
              <p className="text-xs text-muted-foreground">{t("adminPanel.twoFaScan")}</p>
              <p className="text-xs font-mono break-all bg-muted p-2 rounded-md">{twoFaSetup.secret}</p>
              <Input
                placeholder={t("auth.totpCode")}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                maxLength={6}
              />
              <Button onClick={enable2FA} disabled={saving || totpCode.length < 6}>
                {t("settings.enableTwoFa")}
              </Button>
            </div>
          )}

          {admin.totp_enabled && (
            <p className="text-sm text-primary">{t("adminPanel.twoFaActive")}</p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
