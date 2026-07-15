"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminApi } from "@/lib/adminApi";
import type { VerificationRequest } from "@/lib/api";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button, Card, CardContent } from "@/components/ui";

export default function AdminVerificationPage() {
  const { t } = useTranslation();
  const { can } = useAdminAuth();
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [filter, setFilter] = useState("pending");

  const load = () => adminApi.listVerificationRequests(filter).then(setRequests);

  useEffect(() => {
    load();
  }, [filter]);

  const review = async (id: string, approve: boolean) => {
    const note = approve ? undefined : prompt(t("verification.adminRejectNote")) || undefined;
    await adminApi.reviewVerificationRequest(id, approve, note);
    load();
  };

  if (!can("users", "verify")) {
    return <p className="text-muted-foreground">{t("adminPanel.forbidden")}</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">{t("verification.adminTitle")}</h1>
      <div className="flex gap-2 mb-4">
        {(["pending", "approved", "rejected"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={filter === s ? "default" : "outline"}
            onClick={() => setFilter(s)}
          >
            {t(`verification.status.${s}`)}
          </Button>
        ))}
      </div>
      <div className="space-y-3">
        {requests.map((req) => (
          <Card key={req.id}>
            <CardContent className="py-4 space-y-2">
              <div className="flex justify-between gap-3 flex-wrap">
                <p className="font-medium">
                  @{req.username} · {t(`verification.type.${req.applicant_type}`)}
                </p>
                <span className="text-xs text-muted-foreground">{t(`verification.status.${req.status}`)}</span>
              </div>
              {req.applicant_type === "individual" ? (
                <p className="text-sm">
                  {[req.last_name, req.first_name, req.patronymic].filter(Boolean).join(" ")}
                  {req.birth_date && ` · ${new Date(req.birth_date).toLocaleDateString()}`}
                </p>
              ) : (
                <p className="text-sm">
                  {req.legal_entity_name} · ИНН {req.legal_inn}
                  {req.legal_ogrn && ` · ОГРН ${req.legal_ogrn}`}
                </p>
              )}
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{req.reason}</p>
              <div className="text-xs space-y-0.5">
                {req.link_vk_group && <p>VK group: {req.link_vk_group}</p>}
                {req.link_vk_page && <p>VK: {req.link_vk_page}</p>}
                {req.link_instagram && <p>Instagram: {req.link_instagram}</p>}
                {req.link_telegram && <p>Telegram: {req.link_telegram}</p>}
              </div>
              {req.status === "pending" && (
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={() => review(req.id, true)}>
                    {t("verification.adminApprove")}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => review(req.id, false)}>
                    {t("verification.adminReject")}
                  </Button>
                </div>
              )}
              {req.admin_note && (
                <p className="text-xs text-muted-foreground">{t("verification.adminNote")}: {req.admin_note}</p>
              )}
            </CardContent>
          </Card>
        ))}
        {requests.length === 0 && (
          <p className="text-center text-muted-foreground py-8">{t("verification.adminEmpty")}</p>
        )}
      </div>
    </div>
  );
}
