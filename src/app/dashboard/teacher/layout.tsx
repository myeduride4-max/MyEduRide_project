'use client';

import { RouteGuard } from '@/components/shared/RouteGuard';

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return <RouteGuard requiredRole="teacher">{children}</RouteGuard>;
}
