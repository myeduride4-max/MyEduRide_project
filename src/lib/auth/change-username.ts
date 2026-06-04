import type { SupabaseClient } from '@supabase/supabase-js';
import { reserveUsernameForProfile } from '@/lib/auth/ensure-user';
import { resolveAuthUserForProfile } from '@/lib/auth/update-password';
import { authEmailFromUsername, isValidUsername, normalizeUsername } from '@/lib/auth/username';

export async function changeUsernameForProfile(
  supabase: SupabaseClient,
  profileUserId: string,
  rawUsername: string
): Promise<{ username: string } | { error: string }> {
  const normalized = normalizeUsername(rawUsername);
  if (!isValidUsername(normalized)) {
    return {
      error: 'Username must be 3–30 characters (letters, numbers, underscore, dot)',
    };
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, username, full_name')
    .eq('id', profileUserId)
    .maybeSingle();

  if (!profile?.id) {
    return { error: 'User not found' };
  }

  if ((profile.username || '').toLowerCase() === normalized) {
    return { username: profile.username || normalized };
  }

  const { data: taken } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('username', normalized)
    .maybeSingle();

  if (taken && taken.id !== profileUserId) {
    return { error: 'That username is already taken' };
  }

  const username = await reserveUsernameForProfile(supabase, profileUserId, normalized);

  const resolved = await resolveAuthUserForProfile(supabase, profileUserId);
  if ('error' in resolved) {
    return { error: resolved.error };
  }

  const { error: profileErr } = await supabase
    .from('user_profiles')
    .update({ username })
    .eq('id', profileUserId);

  if (profileErr) {
    return { error: profileErr.message };
  }

  const newAuthEmail = authEmailFromUsername(username);
  const currentMeta = resolved.user.user_metadata || {};

  const { error: authErr } = await supabase.auth.admin.updateUserById(resolved.authUserId, {
    email: newAuthEmail,
    user_metadata: {
      ...currentMeta,
      username,
    },
  });

  if (authErr) {
    return { error: authErr.message };
  }

  return { username };
}
