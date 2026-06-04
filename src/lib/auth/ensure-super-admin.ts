import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureAuthUser, ensureUserProfile } from '@/lib/auth/ensure-user';
import { getPlatformSchoolId, isSuperAdminUsername } from '@/lib/auth/super-admin';
import { normalizeUsername } from '@/lib/auth/username';

/** Create platform school, auth user, profile, and super_admin role for env-listed usernames. */
export async function ensureSuperAdminAccess(
  supabase: SupabaseClient,
  username: string
): Promise<{ ok: boolean; error?: string }> {
  const normalized = normalizeUsername(username);
  if (!isSuperAdminUsername(normalized)) {
    return { ok: false, error: 'Not a configured super admin username' };
  }

  const platformSchoolId = getPlatformSchoolId();

  const { error: schoolErr } = await supabase.from('schools').upsert(
    {
      id: platformSchoolId,
      name: process.env.PLATFORM_SCHOOL_NAME?.trim() || 'MyEduRide Platform',
      setup_completed: true,
      setup_step: 'complete',
    },
    { onConflict: 'id' }
  );

  if (schoolErr) {
    console.error('[super-admin] platform school:', schoolErr.message);
    return { ok: false, error: schoolErr.message };
  }

  const fullName =
    process.env.SUPER_ADMIN_DEFAULT_NAME?.trim() ||
    normalized.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const { userId, username: resolvedUsername, password, error: authErr } = await ensureAuthUser(
    supabase,
    { username: normalized, full_name: fullName }
  );

  if (!userId || !resolvedUsername) {
    return { ok: false, error: authErr || 'Could not create auth user' };
  }

  const { error: profileErr } = await ensureUserProfile(supabase, {
    id: userId,
    username: resolvedUsername,
    email: null,
    full_name: fullName,
  });

  if (profileErr) {
    console.error('[super-admin] profile:', profileErr.message);
    return { ok: false, error: profileErr.message };
  }

  if (password) {
    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: { login_password: password, username: resolvedUsername, full_name: fullName },
    });
  }

  const { error: roleErr } = await supabase.from('user_school_roles').upsert(
    {
      user_id: userId,
      school_id: platformSchoolId,
      role: 'super_admin',
      is_active: true,
    },
    { onConflict: 'user_id,school_id,role' }
  );

  if (roleErr) {
    console.error('[super-admin] role:', roleErr.message);
    return { ok: false, error: roleErr.message };
  }

  return { ok: true };
}
