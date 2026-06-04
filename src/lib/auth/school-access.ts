import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppSession } from '@/lib/session';
import { hasRole, sessionHasRole } from '@/lib/session';

const STAFF_ROLES = ['school_admin', 'teacher', 'gate_officer', 'staff'] as const;

/** Any active role tied to this school (including parent). */
export function hasSchoolMembership(session: AppSession, schoolId: string): boolean {
  if (sessionHasRole(session, 'super_admin')) return true;
  return session.roles.some((r) => r.school_id === schoolId);
}

export function canManageSchool(session: AppSession, schoolId: string): boolean {
  if (sessionHasRole(session, 'super_admin')) return true;
  return hasRole(session, 'school_admin', schoolId);
}

export function canViewSchoolDashboard(session: AppSession, schoolId: string): boolean {
  if (sessionHasRole(session, 'super_admin')) return true;
  return hasRole(session, 'school_admin', schoolId);
}

/** Full student roster for a school (admin / gate). */
export function canListSchoolStudents(session: AppSession, schoolId: string): boolean {
  if (sessionHasRole(session, 'super_admin')) return true;
  return (
    hasRole(session, 'school_admin', schoolId) || hasRole(session, 'gate_officer', schoolId)
  );
}

export function canViewSchoolCustomFields(session: AppSession, schoolId: string): boolean {
  if (sessionHasRole(session, 'super_admin')) return true;
  return (
    hasRole(session, 'school_admin', schoolId) ||
    hasRole(session, 'teacher', schoolId) ||
    hasRole(session, 'gate_officer', schoolId)
  );
}

export function canViewSchoolStaffData(session: AppSession, schoolId: string): boolean {
  if (sessionHasRole(session, 'super_admin')) return true;
  return STAFF_ROLES.some((role) => hasRole(session, role, schoolId));
}

export async function isParentLinkedToStudent(
  supabase: SupabaseClient,
  parentUserId: string,
  studentId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('student_parents')
    .select('student_id')
    .eq('student_id', studentId)
    .eq('parent_user_id', parentUserId)
    .maybeSingle();
  return !!data;
}

export async function canViewStudentPickupPersons(
  supabase: SupabaseClient,
  session: AppSession,
  studentId: string
): Promise<boolean> {
  if (sessionHasRole(session, 'super_admin')) return true;

  const { data: student } = await supabase
    .from('students')
    .select('school_id')
    .eq('id', studentId)
    .maybeSingle();

  if (!student?.school_id) return false;

  const schoolId = student.school_id;
  if (canViewSchoolStaffData(session, schoolId)) return true;

  if (session.roles.some((r) => r.role === 'parent')) {
    return isParentLinkedToStudent(supabase, session.user_id, studentId);
  }

  return false;
}

export async function canListSchoolPickupPersons(
  supabase: SupabaseClient,
  session: AppSession,
  schoolId: string
): Promise<boolean> {
  if (sessionHasRole(session, 'super_admin')) return true;
  if (canManageSchool(session, schoolId)) return true;
  if (hasRole(session, 'gate_officer', schoolId)) return true;
  return false;
}
