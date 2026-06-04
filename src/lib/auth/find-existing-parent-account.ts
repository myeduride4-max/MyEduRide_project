import type { SupabaseClient } from '@supabase/supabase-js';
import { lookupUserByUsername, type LookedUpUser } from '@/lib/auth/lookup-user-by-username';

/** Resolve an existing parent/staff account by username (first), email, or phone. */
export async function findExistingParentAccount(
  supabase: SupabaseClient,
  username: string | null | undefined,
  email: string | null | undefined,
  phone?: string | null,
  schoolId?: string
): Promise<LookedUpUser | null> {
  const trimmedUsername = username?.trim();
  if (trimmedUsername) {
    const byUsername = await lookupUserByUsername(supabase, trimmedUsername, {
      schoolId,
      scope: schoolId ? 'parent' : 'global',
    });
    if (byUsername) return byUsername;
    if (schoolId) return null;
  }

  if (email?.includes('@') && !trimmedUsername) {
    const normalized = email.toLowerCase().trim();
    const { data } = await supabase
      .from('user_profiles')
      .select('id, username, full_name, phone, email')
      .eq('email', normalized)
      .maybeSingle();
    if (!data?.id) return null;

    const byUsername = data.username
      ? await lookupUserByUsername(supabase, data.username)
      : null;
    if (byUsername) return byUsername;

    return {
      id: data.id,
      username: data.username || '',
      full_name: data.full_name || '',
      phone: data.phone || null,
      email: data.email || null,
      roles: [],
    };
  }

  if (phone?.trim() && !trimmedUsername) {
    const { data } = await supabase
      .from('user_profiles')
      .select('id, username, full_name, phone, email')
      .eq('phone', phone.trim())
      .maybeSingle();
    if (!data?.id) return null;

    const byUsername = data.username
      ? await lookupUserByUsername(supabase, data.username)
      : null;
    if (byUsername) return byUsername;

    return {
      id: data.id,
      username: data.username || '',
      full_name: data.full_name || '',
      phone: data.phone || null,
      email: data.email || null,
      roles: [],
    };
  }

  return null;
}

export function resolveParentDisplayName(input: {
  parent_name?: string | null;
  parent_username?: string | null;
  parent_email?: string | null;
  existing_full_name?: string | null;
}): string {
  return (
    input.parent_name?.trim() ||
    input.existing_full_name?.trim() ||
    (input.parent_email?.includes('@') ? input.parent_email.split('@')[0] : '') ||
    input.parent_username?.trim() ||
    ''
  );
}
