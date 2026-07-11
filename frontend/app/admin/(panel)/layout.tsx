"use client";

import { AdminAuthProvider } from "@/hooks/useAdminAuth";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminGuard>
        <div className="flex min-h-screen">
          <AdminSidebar />
          <main className="flex-1 p-6 overflow-auto max-w-6xl">{children}</main>
        </div>
      </AdminGuard>
    </AdminAuthProvider>
  );
}
