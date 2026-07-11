"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminApi } from "@/lib/adminApi";
import { sanitizeHtml } from "@/lib/sanitize";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { Button, Card, CardContent } from "@/components/ui";

export default function AdminPagesPage() {
  const { t } = useTranslation();
  const { can } = useAdminAuth();
  const [pages, setPages] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [title, setTitle] = useState("");
  const [html, setHtml] = useState("");
  const [preview, setPreview] = useState(false);

  const load = () => adminApi.pages().then(setPages);
  useEffect(() => { load(); }, []);

  const open = (p: Record<string, unknown>) => {
    setSelected(p);
    setTitle(String(p.title));
    setHtml(String(p.content_html || ""));
    setPreview(false);
  };

  const save = async () => {
    if (!selected) return;
    await adminApi.updatePage(String(selected.slug), title, html);
    load();
    setSelected(null);
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">{t("adminPanel.pages")}</h1>
      {!selected ? (
        <div className="space-y-2">
          {pages.map((p) => (
            <Card key={String(p.slug)} className="cursor-pointer hover:border-primary/50" onClick={() => open(p)}>
              <CardContent className="py-3">
                <p className="font-medium">{String(p.title)}</p>
                <p className="text-sm text-muted-foreground">/{String(p.slug)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>←</Button>
              <div className="flex gap-2">
                <Button variant={preview ? "outline" : "default"} size="sm" onClick={() => setPreview(false)}>
                  {t("adminPanel.edit")}
                </Button>
                <Button variant={preview ? "default" : "outline"} size="sm" onClick={() => setPreview(true)}>
                  {t("adminPanel.preview")}
                </Button>
              </div>
            </div>
            <input
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={preview}
            />
            {!preview ? (
              <RichTextEditor
                value={html}
                onChange={setHtml}
                placeholder={t("admin.annContent")}
                readOnly={!can("pages", "edit")}
              />
            ) : (
              <div className="border rounded-md p-4 prose prose-sm dark:prose-invert max-w-none min-h-[200px]" dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
            )}
            {can("pages", "edit") && !preview && <Button onClick={save}>{t("profile.save")}</Button>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
