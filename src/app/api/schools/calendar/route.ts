import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest, sessionHasRole } from '@/lib/session';
import { lagosDateStringsInRange, lagosWeekend } from '@/lib/attendance/lagos-dates';
import { writeAuditLog } from '@/lib/audit/log';
import { ensureSchoolCalendarSettings } from '@/lib/attendance/school-calendar';

export const dynamic = 'force-dynamic';

const MAX_RANGE_DAYS = 366;
const VALID_DAY_TYPES = new Set(['public_holiday', 'school_event', 'closure']);

function canManage(session: ReturnType<typeof getSessionFromRequest>, schoolId: string) {
  if (!session) return false;
  if (sessionHasRole(session, 'super_admin')) return true;
  return session.roles.some(
    (r) =>
      r.school_id === schoolId &&
      (r.role === 'school_admin' || r.role === 'staff')
  );
}

function canView(session: ReturnType<typeof getSessionFromRequest>, schoolId: string) {
  if (!session) return false;
  if (sessionHasRole(session, 'super_admin')) return true;
  return session.roles.some((r) => r.school_id === schoolId);
}

function normalizeDateInput(value: string): string | null {
  if (!value) return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return null;
}

function groupCalendarDays(rows: Record<string, unknown>[]) {
  const byBatch = new Map<string, Record<string, unknown>>();
  const singles: Record<string, unknown>[] = [];

  for (const row of rows) {
    const batchId = row.batch_id as string | null;
    if (batchId) {
      if (!byBatch.has(batchId)) {
        byBatch.set(batchId, {
          id: batchId,
          batch_id: batchId,
          school_id: row.school_id,
          day_type: row.day_type,
          title: row.title,
          description: row.description,
          notify_parents: row.notify_parents,
          start_date: row.calendar_date,
          end_date: row.range_end_date || row.calendar_date,
          day_count: 1,
        });
      } else {
        const g = byBatch.get(batchId)!;
        const start = String(g.start_date);
        const end = String(g.end_date);
        const d = String(row.calendar_date);
        if (d < start) g.start_date = d;
        if (d > end) g.end_date = d;
        g.day_count = Number(g.day_count) + 1;
      }
    } else {
      singles.push({
        id: row.id,
        batch_id: null,
        school_id: row.school_id,
        day_type: row.day_type,
        title: row.title,
        description: row.description,
        notify_parents: row.notify_parents,
        start_date: row.calendar_date,
        end_date: row.calendar_date,
        day_count: 1,
      });
    }
  }

  return [...byBatch.values(), ...singles].sort((a, b) =>
    String(a.start_date).localeCompare(String(b.start_date))
  );
}

/** GET — list grouped calendar entries */
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const schoolId = request.nextUrl.searchParams.get('school_id');
  if (!schoolId) return NextResponse.json({ error: 'school_id required' }, { status: 400 });
  if (!canView(session, schoolId)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const year = request.nextUrl.searchParams.get('year');
  const month = request.nextUrl.searchParams.get('month');

  const supabase = getAdminClient();
  let q = supabase
    .from('school_non_school_days')
    .select('*')
    .eq('school_id', schoolId)
    .order('calendar_date', { ascending: true });

  if (year && month) {
    const start = `${year}-${month.padStart(2, '0')}-01`;
    const endDay = new Date(Number(year), Number(month), 0).getDate();
    const end = `${year}-${month.padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
    q = q.gte('calendar_date', start).lte('calendar_date', end);
  }

  const { data, error } = await q;
  if (error) {
    if (/school_non_school_days/i.test(error.message)) {
      return NextResponse.json({ events: [], gate_overrides: [], migration_required: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const [{ data: overrides }, { data: calendarSettings }] = await Promise.all([
    supabase
      .from('gate_day_overrides')
      .select('id, override_date, reason, created_at')
      .eq('school_id', schoolId)
      .order('override_date', { ascending: true }),
    supabase
      .from('school_calendar_settings')
      .select('weekend_days')
      .eq('school_id', schoolId)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    events: groupCalendarDays(data || []),
    days: data || [],
    gate_overrides: overrides || [],
    calendar_settings: calendarSettings || { weekend_days: [0, 6] },
  });
}

/** POST — add single day or date range */
export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();

  if (body.action === 'gate_override') {
    const { school_id, override_date, reason } = body;
    const date = normalizeDateInput(String(override_date || ''));
    if (!school_id || !date || !reason?.trim()) {
      return NextResponse.json(
        { error: 'school_id, override_date, and reason are required' },
        { status: 400 }
      );
    }
    if (!canManage(session, school_id)) {
      return NextResponse.json({ error: 'School admin access required' }, { status: 403 });
    }

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('gate_day_overrides')
      .upsert(
        {
          school_id,
          override_date: date,
          reason: String(reason).trim(),
          created_by: session.user_id,
        },
        { onConflict: 'school_id,override_date' }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAuditLog(supabase, {
      school_id,
      actor_user_id: session.user_id,
      action: 'gate_day_override_added',
      entity_type: 'gate_day_overrides',
      entity_id: data?.id,
      details: { override_date: date, reason: String(reason).trim() },
    });

    return NextResponse.json({ success: true, override: data });
  }

  if (body.action === 'delete_gate_override') {
    const { school_id, id, override_date } = body;
    if (!school_id || (!id && !override_date)) {
      return NextResponse.json({ error: 'school_id and id or override_date required' }, { status: 400 });
    }
    if (!canManage(session, school_id)) {
      return NextResponse.json({ error: 'School admin access required' }, { status: 403 });
    }

    const supabase = getAdminClient();
    let q = supabase.from('gate_day_overrides').delete().eq('school_id', school_id);
    if (id) q = q.eq('id', id);
    else q = q.eq('override_date', normalizeDateInput(String(override_date))!);

    const { error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAuditLog(supabase, {
      school_id,
      actor_user_id: session.user_id,
      action: 'gate_day_override_removed',
      entity_type: 'gate_day_overrides',
      entity_id: id || null,
      details: { override_date: override_date || null },
    });

    return NextResponse.json({ success: true });
  }

  const {
    school_id,
    calendar_date,
    start_date,
    end_date,
    day_type,
    title,
    description,
    notify_parents,
  } = body;

  const startRaw = start_date || calendar_date;
  const start = normalizeDateInput(startRaw);
  const end = normalizeDateInput(end_date || startRaw);

  if (!school_id || !start || !day_type || !title) {
    return NextResponse.json(
      { error: 'school_id, start date, day_type, and title are required' },
      { status: 400 }
    );
  }

  if (!canManage(session, school_id)) {
    return NextResponse.json({ error: 'School admin access required' }, { status: 403 });
  }

  if (!VALID_DAY_TYPES.has(String(day_type))) {
    return NextResponse.json(
      { error: 'day_type must be public_holiday, school_event, or closure' },
      { status: 400 }
    );
  }

  const endDate = end && end >= start ? end : start;
  const allDatesInRange = lagosDateStringsInRange(start, endDate);
  const dateStrings = allDatesInRange.filter((d) => !lagosWeekend(d));

  if (allDatesInRange.length > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `Range cannot exceed ${MAX_RANGE_DAYS} days` }, { status: 400 });
  }

  if (dateStrings.length === 0) {
    return NextResponse.json(
      { error: 'No weekdays in that range — weekends are never counted as school days' },
      { status: 400 }
    );
  }

  const batchId = dateStrings.length > 1 ? randomUUID() : null;
  const rows = dateStrings.map((d) => ({
    school_id,
    calendar_date: d,
    range_end_date: dateStrings.length > 1 ? endDate : null,
    batch_id: batchId,
    day_type,
    title: String(title).trim(),
    description: description?.trim() || null,
    notify_parents: !!notify_parents,
  }));

  const supabase = getAdminClient();
  const { error } = await supabase
    .from('school_non_school_days')
    .upsert(rows, { onConflict: 'school_id,calendar_date' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    batch_id: batchId,
    days_created: dateStrings.length,
    start_date: start,
    end_date: endDate,
  });
}

/** DELETE — by row id or whole batch */
export async function DELETE(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  const batchId = request.nextUrl.searchParams.get('batch_id');
  const schoolId = request.nextUrl.searchParams.get('school_id');

  if (!schoolId) {
    return NextResponse.json({ error: 'school_id required' }, { status: 400 });
  }
  if (!id && !batchId) {
    return NextResponse.json({ error: 'id or batch_id required' }, { status: 400 });
  }

  if (!canManage(session, schoolId)) {
    return NextResponse.json({ error: 'School admin access required' }, { status: 403 });
  }

  const supabase = getAdminClient();

  if (batchId) {
    const { error } = await supabase
      .from('school_non_school_days')
      .delete()
      .eq('school_id', schoolId)
      .eq('batch_id', batchId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  const { error } = await supabase
    .from('school_non_school_days')
    .delete()
    .eq('id', id!)
    .eq('school_id', schoolId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
