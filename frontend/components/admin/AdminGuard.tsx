"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/hooks/useAdminAuth";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { admin, loading } = useAdminAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !admin) {
      router.replace("/admin/login");
    }
  }, [admin, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">...</div>
      </div>
    );
  }

  if (!admin) return null;
  return <>{children}</>;
}
