import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest, sessionHasRole } from '@/lib/session';
import { todayInLagos } from '@/lib/timezone';
import { lagosDayBoundsFromDateStr } from '@/lib/attendance/lagos-dates';
import { formatTimeLagos } from '@/lib/timezone';
import { fetchStaffSignLogRows } from '@/lib/attendance/staff-sign-log';
import {
  loadDeparturePickupMaps,
  resolveDeparturePickupPerson,
} from '@/lib/gate/departure-pickup-display';

export const dynamic = 'force-dynamic';

/**
 * GET /api/attendance/sign-log
 * Gate sign-in/out log (students + staff). For gate officers and school admins.
 */
export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const sp = request.nextUrl.searchParams;
    const schoolId = sp.get('school_id');
    const dateParam = sp.get('date') || todayInLagos();
    const entity = sp.get('entity') || 'all';

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

    const entries: {
      id: string;
      entity: 'student' | 'staff';
      name: string;
      detail: string;
      type: string;
      type_label: string;
      timestamp: string;
      time_display: string;
      status?: string;
      pickup_person?: {
        pickup_person_name: string;
        pickup_person_phone?: string | null;
        pickup_source: 'release' | 'notice' | 'request' | 'authorised';
      } | null;
      pickup_notice?: {
        pickup_person_name: string;
        pickup_person_phone?: string | null;
        notes?: string | null;
      } | null;
    }[] = [];

    const pickupMaps = await loadDeparturePickupMaps(
      supabase,
      schoolId,
      dateParam,
      startIso,
      endIso
    );

    if (entity === 'all' || entity === 'student') {
      const { data: records } = await supabase
        .from('attendance_records')
        .select(
          'id, type, status, timestamp, student_id, student:students(first_name, last_name, student_id_number)'
        )
        .eq('school_id', schoolId)
        .gte('timestamp', startIso)
        .lte('timestamp', endIso)
        .order('timestamp', { ascending: false });

      for (const r of records || []) {
        const st = Array.isArray(r.student) ? r.student[0] : r.student;
        const name = st
          ? `${(st as { first_name: string }).first_name} ${(st as { last_name: string }).last_name}`
          : 'Student';
        const studentIdNumber = (st as { student_id_number?: string })?.student_id_number || '';
        const pickupPerson =
          r.type === 'departure' && r.student_id
            ? resolveDeparturePickupPerson(pickupMaps, r.id, r.student_id)
            : null;
        const pickupNotice =
          pickupPerson?.pickup_source === 'notice'
            ? {
                pickup_person_name: pickupPerson.pickup_person_name,
                pickup_person_phone: pickupPerson.pickup_person_phone,
                notes: pickupPerson.notes,
              }
            : null;
        entries.push({
          id: r.id,
          entity: 'student',
          name,
          detail: studentIdNumber,
          type: r.type,
          type_label: r.type === 'arrival' ? 'Check in' : 'Check out',
          timestamp: r.timestamp,
          time_display: formatTimeLagos(r.timestamp),
          status: r.status || undefined,
          pickup_person: pickupPerson,
          pickup_notice: pickupNotice,
        });
      }
    }

    if (entity === 'all' || entity === 'staff') {
      const staffRows = await fetchStaffSignLogRows(supabase, schoolId, startIso, endIso);
      for (const r of staffRows) {
        const sourceLabel =
          r.record_source === 'admin'
            ? 'Admin scan'
            : r.record_source === 'gate'
              ? 'Gate scan'
              : 'ID scan';
        entries.push({
          id: r.id,
          entity: 'staff',
          name: r.full_name,
          detail: sourceLabel,
          type: r.type,
          type_label: r.type === 'clock_in' ? 'Staff sign in' : 'Staff sign out',
          timestamp: r.timestamp,
          time_display: formatTimeLagos(r.timestamp),
        });
      }
    }

    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({
      date: dateParam,
      school_id: schoolId,
      entries,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed';
    console.error('[attendance/sign-log]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
