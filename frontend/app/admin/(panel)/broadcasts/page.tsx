"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminApi } from "@/lib/adminApi";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { Button, Card, CardContent, Input } from "@/components/ui";

export default function AdminBroadcastsPage() {
  const { t } = useTranslation();
  const { can } = useAdminAuth();
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [internalText, setInternalText] = useState("");
  const [type, setType] = useState<"internal" | "email" | "both">("internal");

  const load = () => adminApi.broadcasts().then(setItems);
  useEffect(() => { load(); }, []);

  const create = async () => {
    const b = await adminApi.createBroadcast({
      broadcast_type: type,
      subject,
      body_html: type !== "internal" ? bodyHtml : undefined,
      internal_text: type !== "email" ? internalText || bodyHtml.replace(/<[^>]+>/g, "") : undefined,
    });
    setSubject("");
    setBodyHtml("");
    setInternalText("");
    load();
    if (can("broadcasts", "send") && b && typeof b === "object" && "id" in b) {
      await adminApi.sendBroadcast(String((b as { id: string }).id));
      load();
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">{t("adminPanel.broadcasts")}</h1>
      {can("broadcasts", "create") && (
        <Card className="mb-6">
          <CardContent className="pt-4 space-y-3">
            <Input placeholder={t("admin.annTitle")} value={subject} onChange={(e) => setSubject(e.target.value)} />
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              <option value="internal">{t("adminPanel.broadcastInternal")}</option>
              <option value="email">{t("adminPanel.broadcastEmail")}</option>
              <option value="both">{t("adminPanel.broadcastBoth")}</option>
            </select>
            {(type === "email" || type === "both") && (
              <RichTextEditor value={bodyHtml} onChange={setBodyHtml} placeholder={t("admin.annContent")} />
            )}
            {(type === "internal" || type === "both") && (
              <textarea
                className="w-full min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={internalText}
                onChange={(e) => setInternalText(e.target.value)}
                placeholder={t("adminPanel.internalText")}
              />
            )}
            <Button onClick={create} disabled={!subject}>{t("admin.publish")}</Button>
          </CardContent>
        </Card>
      )}
      <div className="space-y-2">
        {items.map((b) => (
          <Card key={String(b.id)}>
            <CardContent className="py-3 flex justify-between">
              <div>
                <p className="font-medium">{String(b.subject)}</p>
                <p className="text-sm text-muted-foreground">{String(b.status)} · {String(b.sent_count ?? 0)} {t("adminPanel.sent")}</p>
              </div>
              {can("broadcasts", "send") && b.status === "draft" && (
                <Button size="sm" onClick={() => adminApi.sendBroadcast(String(b.id)).then(load)}>{t("adminPanel.send")}</Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
