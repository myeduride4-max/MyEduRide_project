import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest } from '@/lib/session';
import { resolveAttendanceAccess } from '@/lib/attendance/access';
import { attendanceRecordsToCsv } from '@/lib/attendance/csv';
import { lagosDayBoundsFromDateStr } from '@/lib/attendance/lagos-dates';
import { todayInLagos } from '@/lib/timezone';

const PAGE_SIZE = 1000;

async function fetchAllAttendance(
  supabase: ReturnType<typeof getAdminClient>,
  opts: {
    schoolId?: string | null;
    studentIds?: string[] | null;
    day?: string | null;
    from?: string | null;
    to?: string | null;
  }
) {
  const rows: any[] = [];
  let offset = 0;

  while (true) {
    let q = supabase
      .from('attendance_records')
      .select(
        `timestamp, type, status, source, verification_method,
         student:students(first_name, last_name, student_id_number,
           class:school_classes(name),
           school:schools(name))`
      )
      .order('timestamp', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (opts.schoolId) q = q.eq('school_id', opts.schoolId);
    if (opts.studentIds?.length) q = q.in('student_id', opts.studentIds);

    if (opts.day) {
      const { startIso, endIso } = lagosDayBoundsFromDateStr(opts.day);
      q = q.gte('timestamp', startIso).lte('timestamp', endIso);
    } else {
      if (opts.from) q = q.gte('timestamp', opts.from);
      if (opts.to) q = q.lte('timestamp', opts.to);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const schoolId = request.nextUrl.searchParams.get('school_id');
    const scope = request.nextUrl.searchParams.get('scope') || 'day';
    const day = request.nextUrl.searchParams.get('day');
    const from = request.nextUrl.searchParams.get('from');
    const to = request.nextUrl.searchParams.get('to');

    const supabase = getAdminClient();
    const access = await resolveAttendanceAccess(supabase, session, schoolId);

    if ('error' in access) {
      return NextResponse.json({ error: access.error }, { status: 403 });
    }

    const fetchOpts: {
      schoolId?: string | null;
      studentIds?: string[] | null;
      day?: string | null;
      from?: string | null;
      to?: string | null;
    } = {
      schoolId: access.schoolId,
      studentIds: access.studentIds,
    };

    if (scope === 'day') {
      fetchOpts.day = day || todayInLagos();
    } else {
      if (from) fetchOpts.from = from;
      if (to) fetchOpts.to = to;
    }

    const records = await fetchAllAttendance(supabase, fetchOpts);

    const csvRows = records.map((r: any) => {
      const st = r.student;
      const school = Array.isArray(st?.school) ? st.school[0] : st?.school;
      const cls = Array.isArray(st?.class) ? st.class[0] : st?.class;
      return {
        timestamp: r.timestamp,
        student_id_number: st?.student_id_number,
        first_name: st?.first_name,
        last_name: st?.last_name,
        class_name: cls?.name,
        school_name: school?.name,
        type: r.type,
        status: r.status,
        source: r.source,
        verification_method: r.verification_method,
      };
    });

    const csv = attendanceRecordsToCsv(csvRows);
    const dateLabel = fetchOpts.day || 'all_history';
    const filename = `attendance_${access.schoolId || 'all_schools'}_${dateLabel}.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error('[attendance/export]', err);
    return NextResponse.json({ error: err.message || 'Export failed' }, { status: 500 });
  }
}
