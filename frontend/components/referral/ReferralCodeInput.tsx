"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { Input, Label } from "@/components/ui";

const STORAGE_KEY = "vortexm_referral_code";

export function readStoredReferralCode(): string {
  if (typeof window === "undefined") return "";
  try {
    const q = new URLSearchParams(window.location.search).get("ref");
    if (q) {
      localStorage.setItem(STORAGE_KEY, q.trim().toUpperCase());
      return q.trim().toUpperCase();
    }
    return (localStorage.getItem(STORAGE_KEY) || "").trim().toUpperCase();
  } catch {
    return "";
  }
}

export function storeReferralCode(code: string) {
  try {
    localStorage.setItem(STORAGE_KEY, code.trim().toUpperCase());
  } catch {
    /* ignore */
  }
}

type Props = {
  value: string;
  onChange: (code: string) => void;
};

export function ReferralCodeInput({ value, onChange }: Props) {
  const { t } = useTranslation();
  const [referrer, setReferrer] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    const initial = readStoredReferralCode();
    if (initial && !value) onChange(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const code = value.trim().toUpperCase();
    if (code.length < 4) {
      setReferrer(null);
      setInvalid(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .validateReferralCode(code)
        .then((res) => {
          if (cancelled) return;
          setReferrer(res.valid ? res.referrer_username : null);
          setInvalid(!res.valid);
          if (res.valid) storeReferralCode(code);
        })
        .catch(() => {
          if (!cancelled) {
            setReferrer(null);
            setInvalid(true);
          }
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value]);

  return (
    <div className="space-y-2">
      <Label htmlFor="referral_code">{t("referral.referral_code_optional")}</Label>
      <Input
        id="referral_code"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder="VX7K2M9P"
        maxLength={16}
        autoComplete="off"
        className="font-mono uppercase"
      />
      {referrer && (
        <p className="text-xs text-emerald-500">
          ✅ {t("referral.invited_by")}: @{referrer}
        </p>
      )}
      {invalid && value.trim().length >= 4 && (
        <p className="text-xs text-destructive">{t("referral.invalid_code")}</p>
      )}
    </div>
  );
}
