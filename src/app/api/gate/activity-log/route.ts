import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest, sessionHasRole } from '@/lib/session';
import { todayInLagos, formatTimeLagos } from '@/lib/timezone';
import { lagosDayBoundsFromDateStr } from '@/lib/attendance/lagos-dates';

export const dynamic = 'force-dynamic';

const ACTION_LABELS: Record<string, string> = {
  check_in: 'Check in',
  check_out: 'Check out',
  release: 'Released to pickup',
  manual_override: 'Manual override',
  clock_in: 'Staff sign in',
  clock_out: 'Staff sign out',
};

/**
 * GET /api/gate/activity-log?school_id=&date=YYYY-MM-DD
 * Reads gate_activity_logs (Supabase schema) with officer and student names.
 */
export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const sp = request.nextUrl.searchParams;
    const schoolId = sp.get('school_id');
    const dateParam = sp.get('date') || todayInLagos();

    if (!schoolId) {
      return NextResponse.json({ error: 'school_id required' }, { status: 400 });
    }

    const allowed = session.roles.some(
      (r) =>
        r.school_id === schoolId &&
        ['gate_officer', 'school_admin', 'super_admin'].includes(r.role)
    );
    if (!allowed && !sessionHasRole(session, 'super_admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { startIso, endIso } = lagosDayBoundsFromDateStr(dateParam);
    const supabase = getAdminClient();

    const { data: rows, error } = await supabase
      .from('gate_activity_logs')
      .select(
        `id, action_type, pickup_person_name, pickup_person_phone, details, created_at,
         gate_officer_user_id, student_id,
         student:students(first_name, last_name, student_id_number, class:school_classes(name))`
      )
      .eq('school_id', schoolId)
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: false });

    if (error) {
      if (/gate_activity_logs/i.test(error.message)) {
        return NextResponse.json({
          migration_required: true,
          error: 'Run supabase/schema.sql to enable gate activity logs',
          entries: [],
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const officerIds = [
      ...new Set((rows || []).map((r) => r.gate_officer_user_id).filter(Boolean)),
    ] as string[];
    const officerById: Record<string, { full_name?: string; username?: string }> = {};
    if (officerIds.length > 0) {
      const { data: officers } = await supabase
        .from('user_profiles')
        .select('id, full_name, username')
        .in('id', officerIds);
      for (const o of officers || []) {
        officerById[o.id] = o;
      }
    }

    const entries = (rows || []).map((r) => {
      const st = Array.isArray(r.student) ? r.student[0] : r.student;
      const officer = officerById[r.gate_officer_user_id] || {};
      const clsRaw = st?.class as { name?: string } | { name?: string }[] | null | undefined;
      const className = Array.isArray(clsRaw) ? clsRaw[0]?.name : clsRaw?.name;
      const details = (r.details || {}) as { staff_name?: string };
      const studentName = st
        ? `${st.first_name} ${st.last_name}`.trim()
        : details.staff_name || 'Staff';
      return {
        id: r.id,
        action_type: r.action_type,
        action_label: ACTION_LABELS[r.action_type] || r.action_type,
        student_name: studentName,
        student_id_number: st?.student_id_number || '',
        class_name: className || '',
        pickup_person_name: r.pickup_person_name,
        pickup_person_phone: r.pickup_person_phone,
        gate_officer_name: officer.full_name || officer.username || 'Unknown',
        gate_officer_user_id: r.gate_officer_user_id,
        timestamp: r.created_at,
        time_display: formatTimeLagos(r.created_at),
        details: r.details || {},
      };
    });

    return NextResponse.json({
      date: dateParam,
      school_id: schoolId,
      entries,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed';
    console.error('[gate/activity-log]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
