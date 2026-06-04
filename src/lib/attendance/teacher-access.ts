import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppSession } from '@/lib/session';
import { sessionHasRole } from '@/lib/session';
import { getTeacherStudentIds } from '@/lib/attendance/report-access';

export async function assertStudentInSchool(
  supabase: SupabaseClient,
  studentId: string,
  schoolId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('students')
    .select('school_id, is_active')
    .eq('id', studentId)
    .maybeSingle();
  return !!data?.is_active && data.school_id === schoolId;
}

export async function assertTeacherStudentAccess(
  supabase: SupabaseClient,
  session: AppSession,
  schoolId: string,
  studentId: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const inSchool = await assertStudentInSchool(supabase, studentId, schoolId);
  if (!inSchool) {
    return { ok: false, error: 'Student not found in this school', status: 404 };
  }

  if (sessionHasRole(session, 'super_admin')) return { ok: true };

  const isSchoolAdmin = session.roles.some(
    (r) => r.school_id === schoolId && r.role === 'school_admin'
  );
  if (isSchoolAdmin) return { ok: true };

  const isTeacher = session.roles.some(
    (r) => r.school_id === schoolId && r.role === 'teacher'
  );
  if (!isTeacher) {
    return { ok: false, error: 'Teacher access required', status: 403 };
  }

  const allowedIds = await getTeacherStudentIds(supabase, session.user_id, schoolId);
  if (!allowedIds.includes(studentId)) {
    return { ok: false, error: 'This student is not in your assigned class', status: 403 };
  }

  return { ok: true };
}
