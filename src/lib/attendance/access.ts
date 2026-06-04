import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppSession } from '@/lib/session';
import { sessionHasRole } from '@/lib/session';
import { getTeacherStudentIds } from '@/lib/attendance/report-access';

export type AttendanceAccess = {
  schoolId: string | null;
  studentIds: string[] | null;
  role: 'super_admin' | 'school_admin' | 'teacher';
};

/** Who can export attendance and which students they see. */
export async function resolveAttendanceAccess(
  supabase: SupabaseClient,
  session: AppSession,
  requestedSchoolId?: string | null
): Promise<AttendanceAccess | { error: string }> {
  if (sessionHasRole(session, 'super_admin')) {
    return {
      role: 'super_admin',
      schoolId: requestedSchoolId || null,
      studentIds: null,
    };
  }

  const adminRole = session.roles.find((r) => r.role === 'school_admin');
  if (adminRole) {
    const schoolId = requestedSchoolId || adminRole.school_id;
    if (!schoolId || adminRole.school_id !== schoolId) {
      return { error: 'Access denied for this school' };
    }
    return { role: 'school_admin', schoolId, studentIds: null };
  }

  const teacherRole = session.roles.find((r) => r.role === 'teacher');
  if (!teacherRole?.school_id) {
    return { error: 'Teacher role not found' };
  }

  const schoolId = teacherRole.school_id;
  if (requestedSchoolId && requestedSchoolId !== schoolId) {
    return { error: 'Access denied for this school' };
  }

  const studentIds = await getTeacherStudentIds(supabase, session.user_id, schoolId);

  return { role: 'teacher', schoolId, studentIds };
}
