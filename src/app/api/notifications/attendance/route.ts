import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest, sessionHasRole } from '@/lib/session';
import { notifyParentsOfAttendance } from '@/lib/notifications/parent-notify';

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { student_id, attendance_record_id, type } = await request.json();

    if (!student_id || !attendance_record_id || !type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getAdminClient();
    const { data: record } = await supabase
      .from('attendance_records')
      .select('id, student_id, school_id')
      .eq('id', attendance_record_id)
      .maybeSingle();

    if (!record || record.student_id !== student_id) {
      return NextResponse.json({ error: 'Attendance record not found' }, { status: 404 });
    }

    const allowed =
      sessionHasRole(session, 'super_admin') ||
      session.roles.some(
        (r) =>
          r.school_id === record.school_id &&
          ['gate_officer', 'school_admin', 'teacher'].includes(r.role)
      );

    if (!allowed) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const result = await notifyParentsOfAttendance({
      student_id,
      attendance_record_id,
      type: type === 'departure' ? 'departure' : 'arrival',
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Notification error:', error);
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}
