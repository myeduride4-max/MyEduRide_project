import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ensureAuthUser,
  ensureUserProfile,
  findAuthUserIdByEmail,
  reserveUsernameForProfile,
} from '@/lib/auth/ensure-user';
import {
  authEmailFromUsername,
  generateRandomPassword,
  isValidUsername,
  normalizeUsername,
  suggestUniqueUsername,
} from '@/lib/auth/username';
import {
  canRevealUsernameInSchool,
  getActiveSchoolRoles,
} from '@/lib/auth/username-school-scope';
import { resolveInitialPassword } from '@/lib/auth/password-policy';
import { setAuthPasswordForProfile } from '@/lib/auth/update-password';

export type ProvisionParentResult =
  | {
      parent_user_id: string;
      parent_username: string;
      /** Set only when a new account was created or an explicit password was provided */
      password: string;
      created: boolean;
      linked: boolean;
    }
  | { error: string };

type CustomFields = {
  parent_name?: string;
  parent_username?: string;
  parent_email?: string;
  parent_phone?: string;
  relationship?: string;
};

export function parentInfoFromCustomFields(
  customFields: CustomFields | null | undefined
): {
  parent_name: string;
  parent_username: string | null;
  parent_email: string | null;
  parent_phone: string | null;
  relationship: string;
} {
  const cf = customFields || {};
  const parentName =
    cf.parent_name ||
    (cf as Record<string, string>).parent_full_name ||
    (cf as Record<string, string>).parent ||
    '';
  return {
    parent_name: String(parentName).trim(),
    parent_username: cf.parent_username?.trim() || null,
    parent_email: cf.parent_email?.includes('@') ? cf.parent_email.toLowerCase().trim() : null,
    parent_phone: cf.parent_phone?.trim() || null,
    relationship: cf.relationship?.trim() || 'parent',
  };
}

function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = (a || '').replace(/\D/g, '');
  const pb = (b || '').replace(/\D/g, '');
  return !!pa && pa === pb;
}

/** Reuse a parent already linked to a sibling at the same school (same username, email, or phone on file). */
async function findSiblingLinkedParent(
  supabase: SupabaseClient,
  schoolId: string,
  excludeStudentId: string,
  match: {
    username?: string | null;
    email?: string | null;
    phone?: string | null;
  }
): Promise<{ userId: string; username: string } | null> {
  const normalizedUsername = match.username?.trim()
    ? normalizeUsername(match.username)
    : null;
  const normalizedEmail = match.email?.includes('@')
    ? match.email.toLowerCase().trim()
    : null;
  const normalizedPhone = match.phone?.replace(/\s/g, '') || null;

  const { data: students } = await supabase
    .from('students')
    .select('id, custom_fields')
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .neq('id', excludeStudentId);

  for (const student of students || []) {
    const info = parentInfoFromCustomFields(student.custom_fields as CustomFields);
    const sameUsername =
      !!normalizedUsername &&
      !!info.parent_username &&
      normalizeUsername(info.parent_username) === normalizedUsername;
    const sameEmail =
      !!normalizedEmail &&
      !!info.parent_email &&
      info.parent_email.toLowerCase() === normalizedEmail;
    const samePhone = phonesMatch(normalizedPhone, info.parent_phone);

    if (!sameUsername && !sameEmail && !samePhone) continue;

    const { data: link } = await supabase
      .from('student_parents')
      .select('parent_user_id')
      .eq('student_id', student.id)
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!link?.parent_user_id) continue;

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id, username')
      .eq('id', link.parent_user_id)
      .maybeSingle();

    if (profile?.id) {
      return {
        userId: profile.id,
        username: profile.username || normalizedUsername || '',
      };
    }
  }

  return null;
}

/** Create or link a parent login for a student (idempotent). Username is the source of truth. */
export async function provisionParentForStudent(
  supabase: SupabaseClient,
  opts: {
    student_id: string;
    school_id: string;
    parent_name: string;
    parent_username?: string | null;
    parent_email?: string | null;
    parent_phone?: string | null;
    relationship?: string;
    password?: string;
  }
): Promise<ProvisionParentResult> {
  const parentName = opts.parent_name?.trim();
  const email = opts.parent_email?.includes('@') ? opts.parent_email.toLowerCase().trim() : null;
  if (!parentName && !opts.parent_username?.trim() && !email) {
    return { error: 'Parent name, username, or email is required' };
  }

  const explicitPassword = opts.password?.trim() || '';
  let parentUserId: string | undefined;
  let parentUsername: string | undefined;
  let generatedPassword = '';
  let created = false;
  let linkedExisting = false;
  let explicitUsernameForCreate: string | null = null;

  if (opts.parent_username?.trim()) {
    const normalized = normalizeUsername(opts.parent_username);
    if (!isValidUsername(normalized)) {
      return { error: 'Parent username must be 3–30 characters (letters, numbers, underscore only)' };
    }

    const { data: byUsername } = await supabase
      .from('user_profiles')
      .select('id, username, full_name, email, phone')
      .eq('username', normalized)
      .maybeSingle();

    if (byUsername?.id) {
      const roles = await getActiveSchoolRoles(supabase, byUsername.id);
      const { reveal } = canRevealUsernameInSchool(roles, opts.school_id, 'parent');
      if (!reveal) {
        return { error: 'This username is already in use. Choose a different username.' };
      }

      parentUserId = byUsername.id;
      parentUsername = byUsername.username || normalized;
      linkedExisting = true;
    } else {
      explicitUsernameForCreate = normalized;
      parentUsername = normalized;
    }
  }

  if (!parentUserId && email && !opts.parent_username?.trim()) {
    const { data: byEmail } = await supabase
      .from('user_profiles')
      .select('id, username')
      .eq('email', email)
      .maybeSingle();
    if (byEmail?.id) {
      parentUserId = byEmail.id;
      parentUsername = byEmail.username || undefined;
      linkedExisting = true;
    }
  }

  if (!parentUserId && opts.parent_phone?.trim()) {
    const { data: byPhone } = await supabase
      .from('user_profiles')
      .select('id, username')
      .eq('phone', opts.parent_phone.trim())
      .maybeSingle();
    if (byPhone?.id) {
      parentUserId = byPhone.id;
      parentUsername = byPhone.username || undefined;
      linkedExisting = true;
    }
  }

  if (!parentUserId) {
    const sibling = await findSiblingLinkedParent(supabase, opts.school_id, opts.student_id, {
      username: opts.parent_username,
      email,
      phone: opts.parent_phone,
    });
    if (sibling) {
      parentUserId = sibling.userId;
      parentUsername = sibling.username;
      linkedExisting = true;
    }
  }

  if (!parentUserId) {
    const { data: existingLink } = await supabase
      .from('student_parents')
      .select('parent_user_id')
      .eq('student_id', opts.student_id)
      .eq('is_primary', true)
      .maybeSingle();

    if (existingLink?.parent_user_id) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id, username')
        .eq('id', existingLink.parent_user_id)
        .maybeSingle();
      if (profile?.id) {
        parentUserId = profile.id;
        parentUsername = profile.username || undefined;
        linkedExisting = true;
      }
    }
  }

  if (!parentUserId) {
    const desiredUsername =
      explicitUsernameForCreate || (await suggestUniqueUsername(supabase, parentName || 'parent'));

    const { data: profileByUsername } = await supabase
      .from('user_profiles')
      .select('id, username')
      .eq('username', desiredUsername)
      .maybeSingle();

    if (profileByUsername?.id) {
      parentUserId = profileByUsername.id;
      parentUsername = profileByUsername.username || desiredUsername;
      linkedExisting = true;
    } else {
      const existingAuthId = await findAuthUserIdByEmail(
        supabase,
        authEmailFromUsername(desiredUsername)
      );

      if (existingAuthId) {
        parentUserId = existingAuthId;
        parentUsername = desiredUsername;
        linkedExisting = true;
      } else {
        const newPassword = resolveInitialPassword(
          explicitPassword || undefined,
          generateRandomPassword(10)
        );
        const { userId, password, error: authErr } = await ensureAuthUser(supabase, {
          username: desiredUsername,
          full_name: parentName || parentUsername || desiredUsername,
          password: newPassword,
        });
        if (!userId) {
          return { error: authErr || 'Could not create parent auth account' };
        }
        parentUserId = userId;
        parentUsername = desiredUsername;
        generatedPassword = password || newPassword;
        created = true;
      }
    }
  }

  if (!parentUserId) {
    return { error: 'Could not resolve parent account' };
  }

  if (!parentUsername) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('username')
      .eq('id', parentUserId)
      .maybeSingle();
    parentUsername = profile?.username || (await suggestUniqueUsername(supabase, parentName));
  }

  parentUsername = await reserveUsernameForProfile(
    supabase,
    parentUserId,
    parentUsername || parentName || 'parent'
  );

  const profileName =
    parentName ||
    parentUsername ||
    (email ? email.split('@')[0] : '') ||
    'Parent';

  const { error: profileErr } = await ensureUserProfile(supabase, {
    id: parentUserId,
    username: parentUsername,
    full_name: profileName,
    phone: opts.parent_phone || null,
    email,
  });
  if (profileErr) {
    return { error: profileErr.message };
  }

  if (created || explicitPassword) {
    const passwordToSet = explicitPassword || generatedPassword;
    const { error: pwErr } = await setAuthPasswordForProfile(supabase, parentUserId, passwordToSet, {
      createAuthIfMissing: true,
    });
    if (pwErr) {
      return { error: pwErr };
    }
    if (explicitPassword) {
      generatedPassword = explicitPassword;
    }
  }

  await supabase.from('user_school_roles').upsert(
    {
      user_id: parentUserId,
      school_id: opts.school_id,
      role: 'parent',
      is_active: true,
    },
    { onConflict: 'user_id,school_id,role' }
  );

  await supabase.from('student_parents').upsert(
    {
      student_id: opts.student_id,
      parent_user_id: parentUserId,
      relationship: opts.relationship || 'parent',
      is_primary: true,
    },
    { onConflict: 'student_id,parent_user_id' }
  );

  return {
    parent_user_id: parentUserId,
    parent_username: parentUsername,
    password: created || explicitPassword ? generatedPassword : '',
    created,
    linked: linkedExisting && !created,
  };
}
