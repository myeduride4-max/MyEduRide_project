import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { findProfileByUsername } from '@/lib/auth/ensure-user';
import { isValidUsername, normalizeUsername } from '@/lib/auth/username';
import {
  getActiveSchoolRoles,
  userHasRoleAtSchool,
} from '@/lib/auth/username-school-scope';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/login-branding?username=&school_id=
 * Returns school logo/name for login screen (no auth).
 * When school_id is provided, only returns branding if the user belongs to that school.
 */
export async function GET(request: NextRequest) {
  try {
    const username = normalizeUsername(request.nextUrl.searchParams.get('username') || '');
    const schoolId = request.nextUrl.searchParams.get('school_id')?.trim() || '';

    if (!username || !isValidUsername(username)) {
      return NextResponse.json({ school: null, belongs_to_school: false });
    }

    const supabase = getAdminClient();
    const { data: profile } = await findProfileByUsername(supabase, username);
    if (!profile) {
      return NextResponse.json({ school: null, belongs_to_school: false });
    }

    const roles = await getActiveSchoolRoles(supabase, profile.id);

    if (schoolId) {
      const isSuperAdmin = roles.some((r) => r.role === 'super_admin');
      if (!userHasRoleAtSchool(roles, schoolId) && !isSuperAdmin) {
        return NextResponse.json({
          school: null,
          belongs_to_school: false,
          error: 'This username is not registered at this school.',
        });
      }

      const { data: school } = await supabase
        .from('schools')
        .select('id, name, logo_url, welcome_message')
        .eq('id', schoolId)
        .maybeSingle();

      if (!school) {
        return NextResponse.json({ school: null, belongs_to_school: false });
      }

      return NextResponse.json({
        school: {
          id: school.id,
          name: school.name,
          logo_url: school.logo_url,
          welcome_message: school.welcome_message,
        },
        belongs_to_school: true,
      });
    }

    const schoolRole =
      roles.find((r) => r.role === 'school_admin') ||
      roles.find((r) => r.role === 'parent') ||
      roles.find((r) => r.role === 'gate_officer') ||
      roles.find((r) => r.role === 'teacher') ||
      roles[0];

    if (!schoolRole?.school_id) {
      return NextResponse.json({ school: null, belongs_to_school: false });
    }

    const { data: school } = await supabase
      .from('schools')
      .select('id, name, logo_url, welcome_message')
      .eq('id', schoolRole.school_id)
      .maybeSingle();

    if (!school) {
      return NextResponse.json({ school: null, belongs_to_school: false });
    }

    return NextResponse.json({
      school: {
        id: school.id,
        name: school.name,
        logo_url: school.logo_url,
        welcome_message: school.welcome_message,
      },
      belongs_to_school: true,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
