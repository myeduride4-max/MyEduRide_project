import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest, sessionHasRole } from '@/lib/session';

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

    const isSuperAdmin = sessionHasRole(session, 'super_admin');
    const isSchoolStaff = session.roles.some(
      (r) =>
        r.school_id === schoolId &&
        ['school_admin', 'teacher', 'gate_officer'].includes(r.role)
    );

    if (!isSuperAdmin && !isSchoolStaff) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('students')
      .select('*, class:school_classes(name, grade)')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .order('last_name');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ students: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
