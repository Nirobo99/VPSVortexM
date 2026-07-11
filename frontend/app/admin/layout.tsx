import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VortexM Admin",
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
}
