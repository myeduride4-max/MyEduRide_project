import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppSession } from '@/lib/session';
import { sessionHasRole } from '@/lib/session';
import { resolveAttendanceAccess } from '@/lib/attendance/access';

export type ReportCapabilities = {
  schoolId: string;
  studentIds: string[] | null;
  canStudentReports: boolean;
  canStaffReports: boolean;
  staffUserIds: string[] | null;
  role: string;
};

export async function resolveReportCapabilities(
  supabase: SupabaseClient,
  session: AppSession,
  requestedSchoolId?: string | null
): Promise<ReportCapabilities | { error: string }> {
  if (sessionHasRole(session, 'parent') && !sessionHasRole(session, 'school_admin')) {
    return { error: 'Parents use the History tab on their dashboard' };
  }

  const base = await resolveAttendanceAccess(supabase, session, requestedSchoolId);
  if ('error' in base) return { error: base.error };

  const schoolId = base.schoolId!;

  if (base.role === 'school_admin' || base.role === 'super_admin') {
    return {
      role: base.role,
      schoolId,
      studentIds: null,
      canStudentReports: true,
      canStaffReports: true,
      staffUserIds: null,
    };
  }

  if (base.role === 'teacher') {
    return {
      role: 'teacher',
      schoolId,
      studentIds: base.studentIds,
      canStudentReports: true,
      canStaffReports: true,
      staffUserIds: [session.user_id],
    };
  }

  const staffRole = session.roles.find((r) => r.role === 'staff');
  if (staffRole?.school_id) {
    const sid = requestedSchoolId || staffRole.school_id;
    if (requestedSchoolId && requestedSchoolId !== staffRole.school_id) {
      return { error: 'Access denied for this school' };
    }
    return {
      role: 'staff',
      schoolId: sid,
      studentIds: [],
      canStudentReports: false,
      canStaffReports: true,
      staffUserIds: [session.user_id],
    };
  }

  if (sessionHasRole(session, 'gate_officer')) {
    return { error: 'Gate officers use Sign in/out log only' };
  }

  return { error: 'Access denied' };
}

export async function getTeacherStudentIds(
  supabase: SupabaseClient,
  userId: string,
  schoolId: string
): Promise<string[]> {
  const { data: teacherProfile } = await supabase
    .from('teacher_profiles')
    .select('id')
    .eq('user_id', userId)
    .eq('school_id', schoolId)
    .maybeSingle();

  if (!teacherProfile?.id) return [];

  const { data: assignments } = await supabase
    .from('teacher_class_assignments')
    .select('class_id')
    .eq('teacher_profile_id', teacherProfile.id);

  let classIds = (assignments || []).map((a: { class_id: string }) => a.class_id);
  if (classIds.length === 0) {
    const { data: directClasses } = await supabase
      .from('school_classes')
      .select('id')
      .eq('assigned_teacher_id', teacherProfile.id)
      .eq('school_id', schoolId)
      .eq('is_active', true);
    classIds = (directClasses || []).map((c: { id: string }) => c.id);
  }

  if (classIds.length === 0) return [];

  const { data: students } = await supabase
    .from('students')
    .select('id')
    .eq('school_id', schoolId)
    .in('class_id', classIds)
    .eq('is_active', true);

  return (students || []).map((s: { id: string }) => s.id);
}
