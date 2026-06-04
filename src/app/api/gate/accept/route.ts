import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest, sessionHasRole } from '@/lib/session';
import { canAccessGateOperations } from '@/lib/gate/access';
import { fetchStudentPickupContext } from '@/lib/gate/student-pickup-context';
import { notifyParentsOfAttendance } from '@/lib/notifications/parent-notify';
import {
  isLateAtTimestamp,
  isLateByThreshold,
  minutesAfterThreshold,
  minutesLateAtTimestamp,
  nowUtcIso,
  todayInLagos,
} from '@/lib/timezone';
import {
  getStudentTodayStatus,
  getStaffTodayStatus,
  validateStudentGateAction,
  validateStaffGateAction,
} from '@/lib/gate/daily-limits';
import { assertGateDayOpen } from '@/lib/gate/school-day-gate';
import { writeAuditLog } from '@/lib/audit/log';
import { writeGateActivityLog } from '@/lib/gate/activity-log';

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const {
      student_id,
      school_id: bodySchoolId,
      type,
      verification_method,
      person_type,
      staff_profile_id,
      user_id,
      gate_session_id,
      pickup_person_name: bodyPickupName,
      pickup_person_phone: bodyPickupPhone,
      from_ready_queue,
    } = body;

    const supabase = getAdminClient();
    const nowIso = nowUtcIso();

    let lateThreshold = '08:15';
    if (bodySchoolId || student_id) {
      const sid = bodySchoolId || (student_id ? (await supabase.from('students').select('school_id').eq('id', student_id).single()).data?.school_id : null);
      if (sid) {
        const { data: sch } = await supabase.from('schools').select('late_threshold').eq('id', sid).single();
        if (sch?.late_threshold) lateThreshold = sch.late_threshold;
      }
    }

    const isLate = type === 'arrival' && isLateByThreshold(lateThreshold);
    const minutesLate = isLate ? minutesAfterThreshold(lateThreshold) : null;

    const verifiedBy = session.user_id;
    const isAdminScan = session.roles.some(
      (r) => r.role === 'school_admin' || r.role === 'super_admin'
    );

    // Staff clock-in/out
    if (person_type === 'staff' && staff_profile_id && user_id) {
      const { data: profile } = await supabase
        .from('teacher_profiles')
        .select('school_id, user_id')
        .eq('id', staff_profile_id)
        .single();

      const schoolId = bodySchoolId || profile?.school_id;
      if (!schoolId) {
        return NextResponse.json({ error: 'school_id required for staff attendance' }, { status: 400 });
      }

      if (!canAccessGateOperations(session, schoolId)) {
        return NextResponse.json({ error: 'Gate access required' }, { status: 403 });
      }

      if (!sessionHasRole(session, 'super_admin')) {
        const dayCheck = await assertGateDayOpen(supabase, schoolId);
        if (!dayCheck.ok) {
          return NextResponse.json(
            {
              error: `Gate closed today: ${dayCheck.status.label}`,
              code: 'gate_closed',
              gate_day: dayCheck.status,
            },
            { status: 403 }
          );
        }
      }

      if (!profile || profile.user_id !== user_id || profile.school_id !== schoolId) {
        return NextResponse.json({ error: 'Invalid staff profile for this school' }, { status: 403 });
      }

      const staffType = type === 'departure' ? 'clock_out' : 'clock_in';
      const staffToday = await getStaffTodayStatus(supabase, schoolId, user_id);
      const gateAction = type === 'departure' ? 'departure' : 'arrival';
      const validation = validateStaffGateAction(staffToday, gateAction);
      if (!validation.allowed) {
        return NextResponse.json(
          { error: validation.error, code: validation.code, already_recorded: true },
          { status: validation.code === 'must_check_in_first' ? 403 : 409 }
        );
      }

      const staffRecheck = await getStaffTodayStatus(supabase, schoolId, user_id);
      const revalidate = validateStaffGateAction(staffRecheck, gateAction);
      if (!revalidate.allowed) {
        return NextResponse.json(
          { error: revalidate.error, code: revalidate.code, already_recorded: true },
          { status: 409 }
        );
      }

      const staffIsLate =
        staffType === 'clock_in' && isLateAtTimestamp(nowIso, lateThreshold);
      const staffMinutesLate =
        staffType === 'clock_in' ? minutesLateAtTimestamp(nowIso, lateThreshold) : null;

      const staffPayload: Record<string, unknown> = {
        user_id,
        school_id: schoolId,
        gate_session_id: gate_session_id || null,
        type: staffType,
        verification_method: verification_method || 'id_card_scan',
        verified_by_user_id: verifiedBy,
        timestamp: nowIso,
        record_source: isAdminScan ? 'admin' : 'gate',
      };

      let { data, error } = await supabase
        .from('staff_attendance')
        .insert(staffPayload)
        .select()
        .single();

      if (error && /record_source/i.test(error.message)) {
        const legacy = await supabase
          .from('staff_attendance')
          .insert({
            user_id,
            school_id: schoolId,
            gate_session_id: gate_session_id || null,
            type: staffType,
            verification_method: verification_method || 'id_card_scan',
            verified_by_user_id: verifiedBy,
            timestamp: nowIso,
          })
          .select()
          .single();
        data = legacy.data;
        error = legacy.error;
      }

      if (error) {
        console.error('[gate/accept] staff_attendance:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await writeAuditLog(supabase, {
        school_id: schoolId,
        actor_user_id: session.user_id,
        target_user_id: user_id,
        action: `gate_staff_${staffType}`,
        entity_type: 'staff_attendance',
        entity_id: data?.id,
        details: { verification_method, record_source: isAdminScan ? 'admin' : 'gate' },
      });

      const { data: staffProfile } = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('id', user_id)
        .maybeSingle();

      await writeGateActivityLog(supabase, {
        school_id: schoolId,
        gate_officer_user_id: session.user_id,
        action_type: staffType,
        details: {
          staff_user_id: user_id,
          staff_name: staffProfile?.full_name || 'Staff',
          verification_method,
          record_source: isAdminScan ? 'admin' : 'gate',
        },
      });

      return NextResponse.json({
        success: true,
        record: data,
        is_late: staffIsLate,
        minutes_late: staffMinutesLate,
        person_type: 'staff',
      });
    }

    if (!student_id) {
      return NextResponse.json({ error: 'student_id required' }, { status: 400 });
    }

    if (!type || !['arrival', 'departure'].includes(type)) {
      return NextResponse.json({ error: 'type must be arrival or departure' }, { status: 400 });
    }

    const { data: student, error: studentErr } = await supabase
      .from('students')
      .select('id, school_id, first_name, last_name, is_active')
      .eq('id', student_id)
      .single();

    if (studentErr || !student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    if (!student.is_active) {
      return NextResponse.json({ error: 'Student is inactive' }, { status: 400 });
    }

    const schoolId = bodySchoolId || student.school_id;
    if (!schoolId) {
      return NextResponse.json({ error: 'school_id could not be determined' }, { status: 400 });
    }

    if (student.school_id !== schoolId) {
      return NextResponse.json({ error: 'Student does not belong to this school' }, { status: 400 });
    }

    if (!canAccessGateOperations(session, schoolId)) {
      return NextResponse.json({ error: 'Gate access required' }, { status: 403 });
    }

    if (!sessionHasRole(session, 'super_admin')) {
      const dayCheck = await assertGateDayOpen(supabase, schoolId);
      if (!dayCheck.ok) {
        return NextResponse.json(
          {
            error: `Gate closed today: ${dayCheck.status.label}`,
            code: 'gate_closed',
            gate_day: dayCheck.status,
          },
          { status: 403 }
        );
      }
    }

    const studentToday = await getStudentTodayStatus(supabase, schoolId, student_id);
    const validation = validateStudentGateAction(studentToday, type);
    if (!validation.allowed) {
      return NextResponse.json(
        { error: validation.error, code: validation.code, already_recorded: true },
        { status: validation.code === 'must_check_in_first' ? 403 : 409 }
      );
    }

    const studentRecheck = await getStudentTodayStatus(supabase, schoolId, student_id);
    const revalidate = validateStudentGateAction(studentRecheck, type);
    if (!revalidate.allowed) {
      return NextResponse.json(
        { error: revalidate.error, code: revalidate.code, already_recorded: true },
        { status: 409 }
      );
    }

    let usedAdminBypass = false;
    if (type === 'departure') {
      const isAdminBypass =
        sessionHasRole(session, 'super_admin') ||
        session.roles.some(
          (r) => r.school_id === schoolId && r.role === 'school_admin'
        );
      usedAdminBypass = isAdminBypass && !from_ready_queue;

      if (!isAdminBypass) {
        const today = todayInLagos();
        const { data: readyReq } = await supabase
          .from('dismissal_requests')
          .select('id')
          .eq('student_id', student_id)
          .eq('school_id', schoolId)
          .eq('dismissal_date', today)
          .in('status', ['pending', 'approved'])
          .maybeSingle();

        if (!readyReq) {
          return NextResponse.json(
            { error: 'Release only from Ready for Pickup list — teacher must mark student ready first' },
            { status: 403 }
          );
        }
      }
    }

    const { data, error } = await supabase
      .from('attendance_records')
      .insert({
        student_id,
        school_id: schoolId,
        gate_session_id: gate_session_id || null,
        type,
        verification_method: verification_method || 'id_card_scan',
        verified_by_user_id: verifiedBy,
        status: type === 'arrival' ? (isLate ? 'late' : 'on_time') : 'on_time',
        source: 'gate',
        minutes_late: minutesLate,
        timestamp: nowIso,
      })
      .select()
      .single();

    if (error) {
      console.error('[gate/accept] attendance_records:', error.message, { student_id, schoolId, type });
      return NextResponse.json({ error: `Could not save attendance: ${error.message}` }, { status: 500 });
    }

    if (type === 'departure') {
      const today = todayInLagos();
      const { error: dismissCompleteErr } = await supabase
        .from('dismissal_requests')
        .update({ status: 'completed', completed_at: nowIso })
        .eq('student_id', student_id)
        .eq('school_id', schoolId)
        .eq('dismissal_date', today)
        .in('status', ['pending', 'approved']);

      if (dismissCompleteErr) {
        console.error('[gate/accept] dismissal complete:', dismissCompleteErr.message);
      }
    }

    await writeAuditLog(supabase, {
      school_id: schoolId,
      actor_user_id: session.user_id,
      student_id,
      action: type === 'departure' ? 'gate_student_release' : 'gate_student_check_in',
      entity_type: 'attendance_records',
      entity_id: data.id,
      details: { status: data.status, verification_method },
    });

    let pickupName = bodyPickupName?.trim() || null;
    let pickupPhone = bodyPickupPhone?.trim() || null;
    if (type === 'departure' && !pickupName) {
      const today = todayInLagos();
      const ctx = await fetchStudentPickupContext(supabase, schoolId, student_id, today);
      pickupName =
        (ctx.pickup_notice?.pickup_person_name as string) ||
        (ctx.pickup_request?.pickup_person_name as string) ||
        ctx.pickup_persons[0]?.name ||
        null;
      pickupPhone =
        (ctx.pickup_notice?.pickup_person_phone as string) ||
        (ctx.pickup_request?.pickup_person_phone as string) ||
        ctx.pickup_persons[0]?.phone ||
        null;
    }

    const studentAction =
      type === 'departure'
        ? usedAdminBypass
          ? 'manual_override'
          : 'release'
        : 'check_in';

    await writeGateActivityLog(supabase, {
      school_id: schoolId,
      gate_officer_user_id: session.user_id,
      student_id,
      action_type: studentAction,
      pickup_person_name: type === 'departure' ? pickupName : null,
      pickup_person_phone: type === 'departure' ? pickupPhone : null,
      details: {
        attendance_record_id: data.id,
        status: data.status,
        verification_method,
        from_ready_queue: !!from_ready_queue,
      },
    });

    const notifyType = type === 'departure' ? 'departure' : 'arrival';
    const notifyResult = await notifyParentsOfAttendance({
      student_id,
      attendance_record_id: data.id,
      type: notifyType,
    }).catch((err) => {
      console.error('[gate/accept] parent notify failed:', err);
      return { notified: 0, skipped: String(err) };
    });

    return NextResponse.json({
      success: true,
      record: data,
      is_late: isLate,
      parents_notified: notifyResult.notified,
      notify_skipped: notifyResult.skipped,
    });
  } catch (err: any) {
    console.error('[gate/accept] crash:', err);
    return NextResponse.json({ error: err.message || 'Failed to log attendance' }, { status: 500 });
  }
}
