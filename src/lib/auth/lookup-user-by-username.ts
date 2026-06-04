import type { SupabaseClient } from '@supabase/supabase-js';
import { findProfileByUsername } from '@/lib/auth/ensure-user';
import { isValidUsername, normalizeUsername } from '@/lib/auth/username';
import {
  canRevealUsernameInSchool,
  getActiveSchoolRoles,
  type UsernameRevealScope,
} from '@/lib/auth/username-school-scope';

export type LookedUpUser = {
  id: string;
  username: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  roles: string[];
};

export type UsernameLookupResult = {
  user: LookedUpUser | null;
  /** Username exists globally but must not be shown in this school context. */
  taken: boolean;
};

export type UsernameLookupOptions = {
  schoolId?: string;
  scope?: UsernameRevealScope;
};

export async function lookupUserByUsername(
  supabase: SupabaseClient,
  rawUsername: string,
  options?: UsernameLookupOptions
): Promise<LookedUpUser | null> {
  const result = await lookupUserByUsernameDetailed(supabase, rawUsername, options);
  return result.user;
}

export async function lookupUserByUsernameDetailed(
  supabase: SupabaseClient,
  rawUsername: string,
  options?: UsernameLookupOptions
): Promise<UsernameLookupResult> {
  const username = normalizeUsername(rawUsername);
  if (!username || !isValidUsername(username)) {
    return { user: null, taken: false };
  }

  const { data: profile } = await findProfileByUsername(supabase, username);
  if (!profile?.id) {
    return { user: null, taken: false };
  }

  const schoolRoles = await getActiveSchoolRoles(supabase, profile.id);
  const scope = options?.scope || (options?.schoolId ? 'staff' : 'global');
  const { reveal, taken } = canRevealUsernameInSchool(
    schoolRoles,
    options?.schoolId,
    scope
  );

  if (!reveal) {
    return { user: null, taken };
  }

  const roles = [...new Set(schoolRoles.map((r) => r.role))].sort();

  return {
    user: {
      id: profile.id,
      username: profile.username || username,
      full_name: profile.full_name || '',
      phone: profile.phone?.trim() || null,
      email: profile.email?.trim() || null,
      roles,
    },
    taken: false,
  };
}
