'use client';

import { RouteGuard } from '@/components/shared/RouteGuard';

export default function GateLayout({ children }: { children: React.ReactNode }) {
  return <RouteGuard requiredRole="gate_officer">{children}</RouteGuard>;
}
