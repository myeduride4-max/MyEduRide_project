'use client';

import { RouteGuard } from '@/components/shared/RouteGuard';

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return <RouteGuard requiredRole="parent">{children}</RouteGuard>;
}
