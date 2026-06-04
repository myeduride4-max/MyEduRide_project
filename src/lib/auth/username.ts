import type { SupabaseClient } from '@supabase/supabase-js';

const AUTH_EMAIL_DOMAIN = 'login.myeduride.internal';

/** Login username: lowercase letters, numbers, underscore, dot; 3–32 chars */
export function normalizeUsername(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 32);
}

export function isValidUsername(username: string): boolean {
  return /^[a-z0-9][a-z0-9._]{2,31}$/.test(username);
}

/** Supabase Auth requires an email — users sign in with username only in the UI */
export function authEmailFromUsername(username: string): string {
  return `${normalizeUsername(username)}@${AUTH_EMAIL_DOMAIN}`;
}

export function generateRandomPassword(length = 10): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export async function generateUniqueUsername(
  supabase: SupabaseClient,
  base: string
): Promise<string> {
  let candidate = normalizeUsername(base) || 'user';
  if (candidate.length < 3) candidate = `${candidate}user`.slice(0, 32);

  for (let i = 0; i < 50; i++) {
    const tryName = i === 0 ? candidate : `${candidate}${i}`.slice(0, 32);
    const { data } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('username', tryName)
      .maybeSingle();
    if (!data) return tryName;
  }

  return `${candidate}${Date.now().toString(36)}`.slice(0, 32);
}

/** Suggest a unique username from a person's display name */
export async function suggestUniqueUsername(
  supabase: SupabaseClient,
  fullName: string
): Promise<string> {
  const base = fullName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '');
  return generateUniqueUsername(supabase, base || 'parent');
}
