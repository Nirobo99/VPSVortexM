import Link from "next/link";
import { LanguageSwitcher } from "@/components/auth/AuthLayout";

export function LegalLayout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-3">
        <Link href="/" className="text-lg font-bold text-primary shrink-0">
          VortexM
        </Link>
        <h1 className="text-sm sm:text-base font-medium truncate text-center flex-1">{title}</h1>
        <LanguageSwitcher />
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8">{children}</main>
      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground space-x-3">
        <Link href="/pages/terms" className="hover:text-foreground underline-offset-2 hover:underline">
          Пользовательское соглашение
        </Link>
        <span>·</span>
        <Link href="/pages/privacy" className="hover:text-foreground underline-offset-2 hover:underline">
          Политика конфиденциальности
        </Link>
      </footer>
    </div>
  );
}

export function LegalArticle({ children }: { children: React.ReactNode }) {
  return (
    <article className="space-y-5 text-sm leading-relaxed text-foreground/90 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5 [&_p]:mb-2 [&_strong]:text-foreground">
      {children}
    </article>
  );
}
