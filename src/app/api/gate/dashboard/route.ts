import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest } from '@/lib/session';
import { lagosDayBounds, todayInLagos } from '@/lib/timezone';
import { getGateDayStatus } from '@/lib/gate/school-day-gate';
import { fetchEnrichedPickupQueue } from '@/lib/gate/pickup-queue-enrich';
import { matchPickupPhoto, type PickupPersonRow } from '@/lib/gate/student-pickup-context';

type EnrichedPickupNotice = Record<string, unknown> & {
  student_id: string;
  pickup_person_photo: string | null;
  authorised_pickup_persons: PickupPersonRow[];
};

type EnrichedPickupRequest = Record<string, unknown> & {
  student_id: string;
  pickup_person_photo: string | null;
  authorised_pickup_persons: PickupPersonRow[];
};

/** Gate officer: pickup queue, all students, parent pickup notices for today. */
export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const schoolId = request.nextUrl.searchParams.get('school_id');
    if (!schoolId) {
      return NextResponse.json({ error: 'school_id required' }, { status: 400 });
    }

    const allowed = session.roles.some(
      (r) =>
        r.school_id === schoolId &&
        ['gate_officer', 'school_admin', 'super_admin'].includes(r.role)
    );
    if (!allowed && !session.roles.some((r) => r.role === 'super_admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const supabase = getAdminClient();
    const { dateStr, startIso, endIso } = lagosDayBounds();

    const { data: school } = await supabase
      .from('schools')
      .select('id, name, logo_url, primary_color')
      .eq('id', schoolId)
      .single();

    const { data: students, error: studListErr } = await supabase
      .from('students')
      .select('id, first_name, last_name, student_id_number, photo_url, qr_code_data, class:school_classes(name)')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .order('last_name');

    if (studListErr) {
      console.error('[gate/dashboard] students:', studListErr.message);
      return NextResponse.json({ error: studListErr.message }, { status: 500 });
    }

    const studentIds = (students || []).map((s: { id: string }) => s.id);

    const today = dateStr || todayInLagos();

    const queueResult = await fetchEnrichedPickupQueue(supabase, schoolId, {
      today,
      startIso,
      endIso,
      students: students || [],
    });

    if (queueResult.error) {
      console.error('[gate/dashboard] pickup_queue:', queueResult.error);
      return NextResponse.json({ error: queueResult.error }, { status: 500 });
    }

    const pickupQueue = queueResult.pickupQueue;
    const pickupPersonsByStudent = queueResult.pickup_persons_by_student || {};

    const { data: pickupNoticesRaw } = await supabase
      .from('pickup_notices')
      .select(
        `*, student:students(id, first_name, last_name, student_id_number),
         parent:user_profiles!parent_user_id(full_name, phone)`
      )
      .eq('school_id', schoolId)
      .eq('notice_date', dateStr)
      .order('created_at', { ascending: false });

    const { data: pickupRequestsRaw } = await supabase
      .from('pickup_requests')
      .select(`
        *,
        student:students(id, first_name, last_name, student_id_number, photo_url, class:school_classes(name)),
        parent:user_profiles!parent_user_id(full_name, phone)
      `)
      .eq('school_id', schoolId)
      .eq('request_date', dateStr)
      .order('created_at', { ascending: false });

    const enrichNotice = (notice: Record<string, unknown>): EnrichedPickupNotice => {
      const sid = String(notice.student_id ?? '');
      const persons = pickupPersonsByStudent[sid] || [];
      const photo =
        matchPickupPhoto(
          notice.pickup_person_name as string,
          notice.pickup_person_phone as string,
          persons
        ) || null;
      return {
        ...notice,
        student_id: sid,
        pickup_person_photo: photo,
        authorised_pickup_persons: persons,
      };
    };

    const enrichRequest = (req: Record<string, unknown>): EnrichedPickupRequest => {
      const sid = String(req.student_id ?? '');
      const persons = pickupPersonsByStudent[sid] || [];
      const photo =
        matchPickupPhoto(
          req.pickup_person_name as string,
          req.pickup_person_phone as string,
          persons
        ) || null;
      return {
        ...req,
        student_id: sid,
        pickup_person_photo: photo,
        authorised_pickup_persons: persons,
      };
    };

    const pickupNotices: EnrichedPickupNotice[] = (pickupNoticesRaw || []).map((n) =>
      enrichNotice(n as Record<string, unknown>)
    );
    const pickupRequests: EnrichedPickupRequest[] = (pickupRequestsRaw || []).map((r) =>
      enrichRequest(r as Record<string, unknown>)
    );

    const pickupRequestsByStudent: Record<string, EnrichedPickupRequest> = {};
    for (const r of pickupRequests) {
      const sid = r.student_id;
      if (sid && !pickupRequestsByStudent[sid]) pickupRequestsByStudent[sid] = r;
    }

    const gate_day = await getGateDayStatus(supabase, schoolId, today);

    return NextResponse.json({
      school: school || null,
      students: students || [],
      pickup_queue: pickupQueue || [],
      pickup_notices: pickupNotices,
      pickup_requests: pickupRequests,
      pickup_requests_by_student: pickupRequestsByStudent,
      pickup_persons_by_student: pickupPersonsByStudent,
      day: dateStr,
      gate_day,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load gate data';
    console.error('[gate/dashboard]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
