import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getPlatformSchoolId } from '@/lib/auth/super-admin';
import { getSessionFromRequest, sessionHasRole } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session || !sessionHasRole(session, 'super_admin')) {
      return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
    }

    const supabase = getAdminClient();
    const platformId = getPlatformSchoolId();

    const { data: allSchools, error } = await supabase
      .from('schools')
      .select('*')
      .order('name');

    if (error) {
      console.error('[schools/list]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const schools = (allSchools || []).filter((s) => s.id !== platformId);

    const { data: studentCounts, error: studErr } = await supabase
      .from('students')
      .select('school_id')
      .eq('is_active', true);

    if (studErr) console.error('[schools/list] students:', studErr.message);

    const { data: staffCounts, error: staffErr } = await supabase
      .from('user_school_roles')
      .select('school_id')
      .in('role', ['school_admin', 'teacher', 'gate_officer', 'staff'])
      .eq('is_active', true);

    if (staffErr) console.error('[schools/list] staff:', staffErr.message);

    const schoolsWithStats = schools.map((school) => ({
      ...school,
      student_count: studentCounts?.filter((s) => s.school_id === school.id).length || 0,
      staff_count: staffCounts?.filter((s) => s.school_id === school.id).length || 0,
    }));

    return NextResponse.json(
      { schools: schoolsWithStats, count: schoolsWithStats.length },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          Pragma: 'no-cache',
        },
      }
    );
  } catch (err: any) {
    console.error('[schools/list] crash:', err);
    return NextResponse.json({ error: err.message || 'Failed to load schools' }, { status: 500 });
  }
}
