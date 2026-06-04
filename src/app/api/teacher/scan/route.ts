import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest, sessionHasRole } from '@/lib/session';
import { resolveStudentId } from '@/lib/attendance/resolve-student';
import { getTeacherStudentIds } from '@/lib/attendance/report-access';
import { isLateByThreshold, minutesAfterThreshold, nowUtcIso } from '@/lib/timezone';
import { getStudentTodayStatus, validateStudentGateAction } from '@/lib/gate/daily-limits';

export const dynamic = 'force-dynamic';

/**
 * POST /api/teacher/scan
 * Teacher marks a student present (arrival) from classroom.
 */
export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { student_id, qr_code, school_id } = await request.json();
    if (!school_id) {
      return NextResponse.json({ error: 'school_id required' }, { status: 400 });
    }

    const isTeacher = session.roles.some(
      (r) => r.school_id === school_id && ['teacher', 'school_admin'].includes(r.role)
    );
    if (!isTeacher && !sessionHasRole(session, 'super_admin')) {
      return NextResponse.json({ error: 'Teacher access required' }, { status: 403 });
    }

    const supabase = getAdminClient();

    let resolvedStudentId = student_id as string | undefined;
    if (!resolvedStudentId && qr_code) {
      resolvedStudentId = (await resolveStudentId(supabase, school_id, qr_code)) || undefined;
    }

    if (!resolvedStudentId) {
      return NextResponse.json({ error: 'Student not found — check QR or ID' }, { status: 404 });
    }

    const isSchoolAdmin = session.roles.some(
      (r) => r.school_id === school_id && r.role === 'school_admin'
    );
    if (!isSchoolAdmin && !sessionHasRole(session, 'super_admin')) {
      const allowedIds = await getTeacherStudentIds(supabase, session.user_id, school_id);
      if (!allowedIds.includes(resolvedStudentId)) {
        return NextResponse.json(
          { error: 'This student is not in your assigned class' },
          { status: 403 }
        );
      }
    }

    const today = await getStudentTodayStatus(supabase, school_id, resolvedStudentId);
    const validation = validateStudentGateAction(today, 'arrival');
    if (!validation.allowed) {
      return NextResponse.json(
        { error: validation.error, already_recorded: true, today_status: today },
        { status: 409 }
      );
    }

    const { data: school } = await supabase
      .from('schools')
      .select('late_threshold')
      .eq('id', school_id)
      .single();

    const threshold = school?.late_threshold || '08:15';
    const isLate = isLateByThreshold(threshold);
    const minutesLate = isLate ? minutesAfterThreshold(threshold) : null;
    const nowIso = nowUtcIso();

    const basePayload = {
      student_id: resolvedStudentId,
      school_id,
      type: 'arrival' as const,
      verification_method: 'teacher_manual' as const,
      verified_by_user_id: session.user_id,
      status: (isLate ? 'late' : 'on_time') as 'late' | 'on_time',
      source: 'teacher' as const,
      minutes_late: minutesLate,
      timestamp: nowIso,
    };

    let { data: record, error } = await supabase
      .from('attendance_records')
      .insert(basePayload)
      .select()
      .single();

    // Legacy DB without teacher_manual / source columns
    if (error && /teacher_manual|source|minutes_late/i.test(error.message)) {
      const legacy = await supabase
        .from('attendance_records')
        .insert({
          student_id: resolvedStudentId,
          school_id,
          type: 'arrival',
          verification_method: 'manual',
          verified_by_user_id: session.user_id,
          status: isLate ? 'late' : 'on_time',
          timestamp: nowIso,
        })
        .select()
        .single();
      record = legacy.data;
      error = legacy.error;
    }

    if (error) {
      console.error('[teacher/scan]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      record,
      is_late: isLate,
      minutes_late: minutesLate,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed';
    console.error('[teacher/scan]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
