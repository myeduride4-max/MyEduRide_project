import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest, sessionHasRole } from '@/lib/session';
import { ensureStaffProfile } from '@/lib/staff/ensure-profile';

const STAFF_ROLES = ['school_admin', 'teacher', 'gate_officer', 'staff'] as const;

type StaffProfileRow = {
  user_id: string;
  staff_id_number: string | null;
  qr_code_data: string | null;
  photo_url: string | null;
  custom_role_id?: string | null;
};

type CustomRoleRow = { id: string; name: string; can_assign_class: boolean };

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
        ['school_admin', 'teacher', 'gate_officer', 'staff'].includes(r.role)
    );

    if (!isSuperAdmin && !isSchoolStaff) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const supabase = getAdminClient();

    const { data: roles, error: rolesErr } = await supabase
      .from('user_school_roles')
      .select('*, profile:user_profiles(*)')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .in('role', [...STAFF_ROLES]);

    if (rolesErr) {
      return NextResponse.json({ error: rolesErr.message }, { status: 500 });
    }

    const ensureProfiles = request.nextUrl.searchParams.get('ensure_profiles') === '1';
    if (ensureProfiles) {
      for (const r of roles || []) {
        const uid = r.user_id as string;
        if (uid) await ensureStaffProfile(supabase, schoolId, uid);
      }
    }

    const { data: staffProfiles } = await supabase
      .from('teacher_profiles')
      .select('user_id, staff_id_number, qr_code_data, photo_url, custom_role_id')
      .eq('school_id', schoolId);

    const staffProfilesList: StaffProfileRow[] = staffProfiles || [];

    let customRoles: CustomRoleRow[] = [];
    const { data: customRolesData, error: customErr } = await supabase
      .from('school_custom_roles')
      .select('id, name, can_assign_class')
      .eq('school_id', schoolId)
      .eq('is_active', true);

    if (!customErr) {
      customRoles = customRolesData || [];
    }

    const customById = new Map(customRoles.map((c) => [c.id, c]));

    const byUser = new Map<
      string,
      Record<string, unknown> & {
        roles: string[];
        role_ids: string[];
        job_titles: string[];
      }
    >();

    for (const r of roles || []) {
      const row = r as Record<string, unknown> & { user_id: string; id: string; role: string };
      const profileRow = staffProfilesList.find((p) => p.user_id === row.user_id);
      const custom =
        profileRow?.custom_role_id != null
          ? customById.get(profileRow.custom_role_id)
          : null;

      const accessLabel =
        row.role === 'staff' && custom?.name
          ? custom.name
          : String(row.role).replace(/_/g, ' ');

      const existing = byUser.get(row.user_id);
      if (!existing) {
        byUser.set(row.user_id, {
          ...row,
          job_title: accessLabel,
          staff: profileRow || null,
          roles: [row.role],
          role_ids: [row.id],
          job_titles: [accessLabel],
        });
      } else {
        existing.roles.push(row.role);
        existing.role_ids.push(row.id);
        if (!existing.job_titles.includes(accessLabel)) {
          existing.job_titles.push(accessLabel);
        }
        existing.job_title = existing.job_titles.join(' · ');
        if (profileRow && !existing.staff) {
          existing.staff = profileRow;
        }
      }
    }

    return NextResponse.json({ staff: Array.from(byUser.values()) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
