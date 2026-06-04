import type { SupabaseClient } from '@supabase/supabase-js';

type SchoolRoleRow = { role: string; school_id: string };

/** Active roles for a user across all schools. */
export async function getActiveSchoolRoles(
  supabase: SupabaseClient,
  userId: string
): Promise<SchoolRoleRow[]> {
  const { data } = await supabase
    .from('user_school_roles')
    .select('role, school_id')
    .eq('user_id', userId)
    .eq('is_active', true);

  return (data || []) as SchoolRoleRow[];
}

export function userHasRoleAtSchool(
  roles: SchoolRoleRow[],
  schoolId: string
): boolean {
  return roles.some((r) => r.school_id === schoolId);
}

export function userHasParentRole(roles: SchoolRoleRow[]): boolean {
  return roles.some((r) => r.role === 'parent');
}

export type UsernameRevealScope = 'global' | 'staff' | 'parent';

/**
 * Whether it is safe to reveal / auto-fill this user's profile in the given school context.
 * - global: always reveal if the profile exists
 * - staff: only if the user already belongs to this school
 * - parent: if they belong to this school, or are a parent elsewhere (same account, new school)
 */
export function canRevealUsernameInSchool(
  roles: SchoolRoleRow[],
  schoolId: string | undefined,
  scope: UsernameRevealScope
): { reveal: boolean; taken: boolean } {
  if (!schoolId || scope === 'global') {
    return { reveal: true, taken: false };
  }

  if (roles.length === 0) {
    return { reveal: true, taken: false };
  }

  if (userHasRoleAtSchool(roles, schoolId)) {
    return { reveal: true, taken: false };
  }

  if (scope === 'parent' && userHasParentRole(roles)) {
    return { reveal: true, taken: false };
  }

  return { reveal: false, taken: true };
}
