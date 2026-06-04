'use client';

import { RouteGuard } from '@/components/shared/RouteGuard';

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <RouteGuard requiredRole="staff">{children}</RouteGuard>;
}
