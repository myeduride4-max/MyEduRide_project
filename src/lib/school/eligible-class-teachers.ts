import type { SupabaseClient } from '@supabase/supabase-js';

export type EligibleClassTeacher = {
  id: string;
  user_id: string;
  full_name: string;
};

/** Users with app role `teacher`, or staff whose job role allows class assignment. */
export async function fetchEligibleClassTeachers(
  supabase: SupabaseClient,
  schoolId: string
): Promise<EligibleClassTeacher[]> {
  const { data: profiles, error: profErr } = await supabase
    .from('teacher_profiles')
    .select('id, user_id, custom_role_id, user:user_profiles(full_name)')
    .eq('school_id', schoolId);

  if (profErr) {
    console.error('[eligible-class-teachers] profiles:', profErr.message);
    return [];
  }

  if (!profiles?.length) return [];

  const userIds = profiles.map((p) => p.user_id).filter(Boolean);
  const { data: roles, error: rolesErr } = await supabase
    .from('user_school_roles')
    .select('user_id, role')
    .eq('school_id', schoolId)
    .in('user_id', userIds)
    .eq('is_active', true);

  if (rolesErr) {
    console.error('[eligible-class-teachers]', rolesErr.message);
    return [];
  }

  const { data: classJobRoles } = await supabase
    .from('school_custom_roles')
    .select('id')
    .eq('school_id', schoolId)
    .eq('can_assign_class', true)
    .eq('is_active', true);

  const classJobRoleIds = new Set((classJobRoles || []).map((r) => r.id));
  const rolesByUser = new Map<string, string[]>();
  for (const r of roles || []) {
    const list = rolesByUser.get(r.user_id) || [];
    list.push(r.role);
    rolesByUser.set(r.user_id, list);
  }

  const eligible: EligibleClassTeacher[] = [];
  for (const p of profiles) {
    const userRoles = rolesByUser.get(p.user_id) || [];
    const isSystemTeacher = userRoles.includes('teacher');
    const isClassStaff =
      userRoles.includes('staff') &&
      p.custom_role_id &&
      classJobRoleIds.has(p.custom_role_id);

    if (!isSystemTeacher && !isClassStaff) continue;

    const user = Array.isArray(p.user) ? p.user[0] : p.user;
    eligible.push({
      id: p.id as string,
      user_id: p.user_id as string,
      full_name: (user as { full_name?: string })?.full_name || 'Teacher',
    });
  }

  return eligible.sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export async function isEligibleClassTeacherProfile(
  supabase: SupabaseClient,
  schoolId: string,
  teacherProfileId: string | null | undefined
): Promise<boolean> {
  if (!teacherProfileId) return true;

  const { data: profile } = await supabase
    .from('teacher_profiles')
    .select('user_id, custom_role_id')
    .eq('id', teacherProfileId)
    .eq('school_id', schoolId)
    .maybeSingle();

  if (!profile?.user_id) return false;

  const { data: teacherRole } = await supabase
    .from('user_school_roles')
    .select('id')
    .eq('user_id', profile.user_id)
    .eq('school_id', schoolId)
    .eq('role', 'teacher')
    .eq('is_active', true)
    .maybeSingle();

  if (teacherRole) return true;

  if (!profile.custom_role_id) return false;

  const { data: customRole } = await supabase
    .from('school_custom_roles')
    .select('can_assign_class')
    .eq('id', profile.custom_role_id)
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .maybeSingle();

  if (!customRole?.can_assign_class) return false;

  const { data: staffRole } = await supabase
    .from('user_school_roles')
    .select('id')
    .eq('user_id', profile.user_id)
    .eq('school_id', schoolId)
    .eq('role', 'staff')
    .eq('is_active', true)
    .maybeSingle();

  return !!staffRole;
}
