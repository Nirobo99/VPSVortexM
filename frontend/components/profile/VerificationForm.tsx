"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type VerificationRequest } from "@/lib/api";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Select, Textarea } from "@/components/ui";

type ApplicantType = "individual" | "organization";

export function VerificationForm({
  existing,
  isVerified,
  onSubmitted,
}: {
  existing: VerificationRequest | null;
  isVerified: boolean;
  onSubmitted: (req: VerificationRequest) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applicantType, setApplicantType] = useState<ApplicantType>("individual");
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    patronymic: "",
    birth_date: "",
    legal_entity_name: "",
    legal_inn: "",
    legal_ogrn: "",
    legal_address: "",
    reason: "",
    link_vk_group: "",
    link_vk_page: "",
    link_instagram: "",
    link_telegram: "",
  });

  const submit = async () => {
    setSaving(true);
    try {
      const req = await api.submitVerificationRequest({
        applicant_type: applicantType,
        first_name: applicantType === "individual" ? form.first_name : null,
        last_name: applicantType === "individual" ? form.last_name : null,
        patronymic: applicantType === "individual" ? form.patronymic || null : null,
        birth_date: applicantType === "individual" ? form.birth_date || null : null,
        legal_entity_name: applicantType === "organization" ? form.legal_entity_name : null,
        legal_inn: applicantType === "organization" ? form.legal_inn : null,
        legal_ogrn: applicantType === "organization" ? form.legal_ogrn || null : null,
        legal_address: applicantType === "organization" ? form.legal_address || null : null,
        reason: form.reason,
        link_vk_group: form.link_vk_group || null,
        link_vk_page: form.link_vk_page || null,
        link_instagram: form.link_instagram || null,
        link_telegram: form.link_telegram || null,
      });
      onSubmitted(req);
      setOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : t("auth.error"));
    } finally {
      setSaving(false);
    }
  };

  if (isVerified) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("verification.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-primary">{t("verification.verified")}</p>
        </CardContent>
      </Card>
    );
  }

  if (existing?.status === "pending") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("verification.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("verification.pending")}</p>
        </CardContent>
      </Card>
    );
  }

  if (existing?.status === "rejected") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("verification.title")}</CardTitle>
          <CardDescription>{t("verification.rejected")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {existing.admin_note && (
            <p className="text-xs text-muted-foreground">{existing.admin_note}</p>
          )}
          {!open ? (
            <Button variant="outline" onClick={() => setOpen(true)}>
              {t("verification.applyAgain")}
            </Button>
          ) : (
            renderForm()
          )}
        </CardContent>
      </Card>
    );
  }

  function renderForm() {
    return (
      <div className="space-y-3">
        <div>
          <Label>{t("verification.applicantType")}</Label>
          <Select
            value={applicantType}
            onChange={(e) => setApplicantType(e.target.value as ApplicantType)}
          >
            <option value="individual">{t("verification.individual")}</option>
            <option value="organization">{t("verification.organization")}</option>
          </Select>
        </div>

        {applicantType === "individual" ? (
          <>
            <div>
              <Label>{t("verification.firstName")}</Label>
              <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div>
              <Label>{t("verification.lastName")}</Label>
              <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
            <div>
              <Label>{t("verification.patronymic")}</Label>
              <Input value={form.patronymic} onChange={(e) => setForm({ ...form, patronymic: e.target.value })} />
            </div>
            <div>
              <Label>{t("verification.birthDate")}</Label>
              <Input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
            </div>
          </>
        ) : (
          <>
            <div>
              <Label>{t("verification.legalName")}</Label>
              <Input value={form.legal_entity_name} onChange={(e) => setForm({ ...form, legal_entity_name: e.target.value })} />
            </div>
            <div>
              <Label>{t("verification.legalInn")}</Label>
              <Input value={form.legal_inn} onChange={(e) => setForm({ ...form, legal_inn: e.target.value })} />
            </div>
            <div>
              <Label>{t("verification.legalOgrn")}</Label>
              <Input value={form.legal_ogrn} onChange={(e) => setForm({ ...form, legal_ogrn: e.target.value })} />
            </div>
            <div>
              <Label>{t("verification.legalAddress")}</Label>
              <Textarea value={form.legal_address} onChange={(e) => setForm({ ...form, legal_address: e.target.value })} rows={2} />
            </div>
          </>
        )}

        <div>
          <Label>{t("verification.reason")}</Label>
          <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3} />
        </div>
        <div>
          <Label>{t("verification.linkVkGroup")}</Label>
          <Input value={form.link_vk_group} onChange={(e) => setForm({ ...form, link_vk_group: e.target.value })} />
        </div>
        <div>
          <Label>{t("verification.linkVkPage")}</Label>
          <Input value={form.link_vk_page} onChange={(e) => setForm({ ...form, link_vk_page: e.target.value })} />
        </div>
        <div>
          <Label>{t("verification.linkInstagram")}</Label>
          <Input value={form.link_instagram} onChange={(e) => setForm({ ...form, link_instagram: e.target.value })} />
        </div>
        <div>
          <Label>{t("verification.linkTelegram")}</Label>
          <Input value={form.link_telegram} onChange={(e) => setForm({ ...form, link_telegram: e.target.value })} />
        </div>

        <div className="flex gap-2">
          <Button onClick={submit} disabled={saving}>
            {t("verification.submit")}
          </Button>
          {existing?.status === "rejected" && (
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("profile.cancel")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("verification.title")}</CardTitle>
        <CardDescription>{t("verification.hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        {!open ? (
          <Button variant="outline" onClick={() => setOpen(true)}>
            {t("verification.apply")}
          </Button>
        ) : (
          renderForm()
        )}
      </CardContent>
    </Card>
  );
}
