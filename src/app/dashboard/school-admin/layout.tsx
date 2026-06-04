'use client';

import { AdminSidebar } from '@/components/shared/AdminSidebar';
import { RouteGuard } from '@/components/shared/RouteGuard';

export default function SchoolAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RouteGuard requiredRole="school_admin">
      <div className="flex min-h-screen">
        <AdminSidebar />
        <main className="flex-1 md:ml-56">{children}</main>
      </div>
    </RouteGuard>
  );
}
