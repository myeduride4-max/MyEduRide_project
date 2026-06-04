import type { AppSession } from '@/lib/session';
import { sessionHasRole } from '@/lib/session';

const GATE_ROLES = ['gate_officer', 'school_admin'] as const;

/** Gate scan, accept, and dashboard access for a school. */
export function canAccessGateOperations(session: AppSession, schoolId: string): boolean {
  if (sessionHasRole(session, 'super_admin')) return true;
  return session.roles.some(
    (r) => r.school_id === schoolId && GATE_ROLES.includes(r.role as (typeof GATE_ROLES)[number])
  );
}

/** Start/end gate_sessions — gate officers and school admins only. */
export function canManageGateSession(session: AppSession, schoolId: string): boolean {
  return canAccessGateOperations(session, schoolId);
}
