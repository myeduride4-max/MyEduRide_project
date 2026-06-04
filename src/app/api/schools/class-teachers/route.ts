import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest, sessionHasRole } from '@/lib/session';
import { fetchEligibleClassTeachers } from '@/lib/school/eligible-class-teachers';

export const dynamic = 'force-dynamic';

/** GET — class teachers and staff with a class-capable job role (homeroom assignment). */
export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const schoolId = request.nextUrl.searchParams.get('school_id');
    if (!schoolId) return NextResponse.json({ error: 'school_id required' }, { status: 400 });

    const allowed =
      sessionHasRole(session, 'super_admin') ||
      session.roles.some(
        (r) =>
          r.school_id === schoolId &&
          ['school_admin', 'teacher', 'gate_officer'].includes(r.role)
      );

    if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const supabase = getAdminClient();
    const teachers = await fetchEligibleClassTeachers(supabase, schoolId);

    return NextResponse.json({ teachers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
