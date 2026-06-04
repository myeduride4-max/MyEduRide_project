import type { SupabaseClient, User } from '@supabase/supabase-js';
import { ensureAuthUser, ensureUserProfile, findAuthUserIdByEmail, reserveUsernameForProfile } from '@/lib/auth/ensure-user';
import { authEmailFromUsername, normalizeUsername } from '@/lib/auth/username';

export type ResolveAuthResult =
  | { authUserId: string; user: User }
  | { error: string };

/** Resolve Supabase Auth user for a user_profiles row (ids can diverge on legacy data). */
export async function resolveAuthUserForProfile(
  supabase: SupabaseClient,
  profileUserId: string
): Promise<ResolveAuthResult> {
  const { data: profile, error: profileErr } = await supabase
    .from('user_profiles')
    .select('id, username, full_name')
    .eq('id', profileUserId)
    .maybeSingle();

  if (profileErr || !profile) {
    return { error: 'User not found' };
  }

  // Login always uses authEmailFromUsername — resolve that auth account first.
  if (profile.username) {
    const authEmail = authEmailFromUsername(profile.username);
    const authUserId = await findAuthUserIdByEmail(supabase, authEmail);
    if (authUserId) {
      const { data: authUser, error: authErr } = await supabase.auth.admin.getUserById(authUserId);
      if (!authErr && authUser?.user) {
        return { authUserId: authUser.user.id, user: authUser.user };
      }
    }
  }

  const { data: byId, error: byIdErr } = await supabase.auth.admin.getUserById(profileUserId);
  if (!byIdErr && byId?.user) {
    return { authUserId: byId.user.id, user: byId.user };
  }

  return { error: 'Auth account not found for this user' };
}

async function createAuthAccountForProfile(
  supabase: SupabaseClient,
  profileUserId: string,
  password: string
): Promise<ResolveAuthResult> {
  const { data: profileRow } = await supabase
    .from('user_profiles')
    .select('username, full_name')
    .eq('id', profileUserId)
    .maybeSingle();

  if (!profileRow) {
    return { error: 'User not found' };
  }

  let username = profileRow.username ? normalizeUsername(profileRow.username) : '';
  if (!username) {
    username = await reserveUsernameForProfile(
      supabase,
      profileUserId,
      profileRow.full_name || 'parent'
    );
    await ensureUserProfile(supabase, {
      id: profileUserId,
      username,
      full_name: profileRow.full_name || 'Parent',
    });
  }

  const { userId, error: authErr } = await ensureAuthUser(supabase, {
    username,
    full_name: profileRow.full_name || '',
    password,
  });

  if (!userId) {
    return { error: authErr || 'Could not create auth account' };
  }

  const { data: authUser, error: getErr } = await supabase.auth.admin.getUserById(userId);
  if (getErr || !authUser?.user) {
    return { error: 'User not found' };
  }

  return { authUserId: authUser.user.id, user: authUser.user };
}

export async function setAuthPasswordForProfile(
  supabase: SupabaseClient,
  profileUserId: string,
  password: string,
  options?: { createAuthIfMissing?: boolean }
): Promise<{ error?: string }> {
  let resolved = await resolveAuthUserForProfile(supabase, profileUserId);

  if ('error' in resolved) {
    if (options?.createAuthIfMissing && resolved.error === 'Auth account not found for this user') {
      resolved = await createAuthAccountForProfile(supabase, profileUserId, password);
    }
    if ('error' in resolved) {
      return { error: resolved.error };
    }
  }

  const { authUserId, user } = resolved;
  const currentMeta = user.user_metadata || {};

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('username')
    .eq('id', profileUserId)
    .maybeSingle();

  const expectedEmail = profile?.username ? authEmailFromUsername(profile.username) : null;
  const updatePayload: {
    password: string;
    user_metadata: Record<string, unknown>;
    email?: string;
  } = {
    password,
    user_metadata: {
      ...currentMeta,
      login_password: password,
      username: profile?.username || currentMeta.username,
    },
  };

  if (expectedEmail && user.email?.toLowerCase() !== expectedEmail.toLowerCase()) {
    updatePayload.email = expectedEmail;
  }

  const { error: updateErr } = await supabase.auth.admin.updateUserById(authUserId, updatePayload);

  if (updateErr) {
    return { error: updateErr.message };
  }

  await supabase
    .from('user_profiles')
    .update({
      last_password_change_at: new Date().toISOString(),
      auth_preference: 'password',
    })
    .eq('id', profileUserId);

  return {};
}
