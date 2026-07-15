"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { api } from "@/lib/api";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { sanitizeHtml } from "@/lib/sanitize";

interface PublicPage {
  slug: string;
  title: string;
  content_html: string;
}

export default function StaticPageView() {
  const { t } = useTranslation();
  const params = useParams();
  const slug = decodeURIComponent(params.slug as string);
  const [page, setPage] = useState<PublicPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPublicPage(slug)
      .then(setPage)
      .catch((e) => setError(e instanceof Error ? e.message : t("auth.error")));
  }, [slug, t]);

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto space-y-4">
        <Link href="/wallet">
          <Button variant="ghost" size="sm">
            ← {t("wallet.backToWallet")}
          </Button>
        </Link>

        {error && !page && <Alert variant="destructive">{error}</Alert>}

        {page && (
          <Card>
            <CardHeader>
              <CardTitle>{page.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-sm"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(page.content_html) }}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
