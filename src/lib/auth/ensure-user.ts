import type { SupabaseClient } from '@supabase/supabase-js';
import {
  authEmailFromUsername,
  generateRandomPassword,
  generateUniqueUsername,
  normalizeUsername,
} from '@/lib/auth/username';

/** Paginated lookup — listUsers() without args only returns the first page. */
export async function findAuthUserIdByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<string | null> {
  const normalized = email.toLowerCase().trim();
  let page = 1;
  const perPage = 1000;

  while (page <= 50) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error('[auth] listUsers error:', error.message);
      return null;
    }

    const found = data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (found) return found.id;

    if (data.users.length < perPage) break;
    page++;
  }

  return null;
}

export async function findProfileByUsername(supabase: SupabaseClient, username: string) {
  const normalized = normalizeUsername(username);
  return supabase
    .from('user_profiles')
    .select('id, username, email, full_name, phone, failed_login_attempts, locked_until')
    .eq('username', normalized)
    .maybeSingle();
}

/** Pick a username that is free, or already owned by profileId. */
export async function reserveUsernameForProfile(
  supabase: SupabaseClient,
  profileId: string,
  desiredUsername: string
): Promise<string> {
  let candidate = normalizeUsername(desiredUsername) || 'user';
  if (candidate.length < 3) candidate = `${candidate}user`.slice(0, 32);

  for (let i = 0; i < 60; i++) {
    const tryName = i === 0 ? candidate : `${candidate}${i}`.slice(0, 32);
    const { data } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('username', tryName)
      .maybeSingle();
    if (!data || data.id === profileId) return tryName;
  }

  return `${candidate}${Date.now().toString(36)}`.slice(0, 32);
}

type EnsureAuthParams = {
  username?: string;
  email?: string | null;
  full_name?: string;
  password?: string;
};

/** Create auth user + return credentials. Uses internal auth email derived from username. */
export async function ensureAuthUser(
  supabase: SupabaseClient,
  params: EnsureAuthParams | string
): Promise<{ userId: string | null; username?: string; password?: string; error?: string }> {
  const input: EnsureAuthParams =
    typeof params === 'string' ? { username: params } : params;

  let username = input.username ? normalizeUsername(input.username) : '';
  if (!username && input.email) {
    username = await generateUniqueUsername(
      supabase,
      input.email.split('@')[0] || 'user'
    );
  }
  if (!username) {
    return { userId: null, error: 'Username is required' };
  }

  const { data: existingProfile } = await supabase
    .from('user_profiles')
    .select('id, username')
    .eq('username', username)
    .maybeSingle();
  if (existingProfile?.id) {
    return { userId: existingProfile.id, username: existingProfile.username || username };
  }

  const generatedPassword = input.password || generateRandomPassword(10);
  const authEmail = authEmailFromUsername(username);

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: authEmail,
    email_confirm: true,
    password: generatedPassword,
    user_metadata: {
      login_password: generatedPassword,
      username,
      full_name: input.full_name || '',
    },
  });

  if (!authError && authUser?.user) {
    return { userId: authUser.user.id, username, password: generatedPassword };
  }

  const existingId = await findAuthUserIdByEmail(supabase, authEmail);
  if (existingId) {
    return { userId: existingId, username };
  }

  return { userId: null, error: authError?.message || 'Failed to create user' };
}

export async function ensureUserProfile(
  supabase: SupabaseClient,
  params: {
    id: string;
    username: string;
    email?: string | null;
    full_name: string;
    phone?: string | null;
  }
) {
  const username = await reserveUsernameForProfile(supabase, params.id, params.username);

  let phone = params.phone?.trim() || null;
  if (phone) {
    const { data: phoneOwner } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();
    if (phoneOwner && phoneOwner.id !== params.id) {
      phone = null;
    }
  }

  const row = {
    id: params.id,
    username,
    email: params.email?.toLowerCase().trim() || null,
    full_name: params.full_name,
    phone,
    auth_preference: 'password' as const,
  };

  let result = await supabase.from('user_profiles').upsert(row, { onConflict: 'id' });

  if (result.error && /unique|duplicate/i.test(result.error.message)) {
    const fallbackUsername = await reserveUsernameForProfile(
      supabase,
      params.id,
      `${username}${Date.now().toString(36)}`
    );
    result = await supabase.from('user_profiles').upsert(
      { ...row, username: fallbackUsername },
      { onConflict: 'id' }
    );
  }

  return result;
}