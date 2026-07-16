"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/layout/AppShell";
import { LegalLayout } from "@/components/legal/LegalLayout";
import { TermsOfServiceContent } from "@/components/legal/TermsOfServiceContent";
import { PrivacyPolicyContent } from "@/components/legal/PrivacyPolicyContent";
import { api } from "@/lib/api";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { sanitizeHtml } from "@/lib/sanitize";

interface PublicPage {
  slug: string;
  title: string;
  content_html: string;
}

function resolveLegalSlug(slug: string): "terms" | "privacy" | null {
  const key = slug.toLowerCase();
  if (key === "terms" || key === "rules" || key === "agreement" || key === "user-agreement") {
    return "terms";
  }
  if (key === "privacy" || key === "privacy-policy" || key === "confidentiality") {
    return "privacy";
  }
  return null;
}

function BuiltinLegalPage({ kind }: { kind: "terms" | "privacy" }) {
  const title =
    kind === "terms"
      ? "Пользовательское соглашение сервиса VortexM"
      : "Политика конфиденциальности мессенджера VortexM";

  return (
    <LegalLayout title={title}>
      {kind === "terms" ? <TermsOfServiceContent /> : <PrivacyPolicyContent />}
    </LegalLayout>
  );
}

export default function StaticPageView() {
  const { t } = useTranslation();
  const params = useParams();
  const slug = decodeURIComponent(params.slug as string);
  const legalKind = resolveLegalSlug(slug);
  const { user, loading: authLoading } = useAuth();
  const [page, setPage] = useState<PublicPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (legalKind) return;
    api
      .getPublicPage(slug)
      .then(setPage)
      .catch((e) => setError(e instanceof Error ? e.message : t("auth.error")));
  }, [slug, t, legalKind]);

  if (legalKind) {
    return <BuiltinLegalPage kind={legalKind} />;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">...</div>
    );
  }

  const body = (
    <div className="max-w-2xl mx-auto space-y-4">
      <Link href={user ? "/wallet" : "/"}>
        <Button variant="ghost" size="sm">
          ← {user ? t("wallet.backToWallet") : "VortexM"}
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
  );

  if (!user) {
    return <LegalLayout title={page?.title || slug}>{body}</LegalLayout>;
  }

  return <AppShell>{body}</AppShell>;
}
