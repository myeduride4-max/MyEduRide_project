import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest } from '@/lib/session';
import { fetchStudentParentCredentials } from '@/lib/school/student-parent-credentials';
import { aggregateStudentParentRows } from '@/lib/school/school-parents-list';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session?.user_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const schoolIds = Array.from(
    new Set(
      (session.roles || [])
        .filter((r) => r.role === 'school_admin')
        .map((r) => r.school_id)
        .filter(Boolean)
    )
  );

  if (schoolIds.length === 0) {
    return NextResponse.json({ error: 'School admin access required' }, { status: 403 });
  }

  const schoolId = schoolIds[0];

  try {
    const supabase = getAdminClient();
    const profileById = new Map<
      string,
      { id: string; username: string | null; full_name: string | null }
    >();
    const authById = new Map<string, string>();

    const studentRows = await fetchStudentParentCredentials(
      supabase,
      schoolId,
      profileById,
      authById,
      { repairMissingParents: true }
    );

    const parents = aggregateStudentParentRows(studentRows);

    return NextResponse.json({
      school_id: schoolId,
      parents,
      total: parents.length,
      with_login: parents.filter((p) => p.has_login).length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load parents';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
