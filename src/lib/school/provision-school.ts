import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureAuthUser, ensureUserProfile } from '@/lib/auth/ensure-user';
import { resolveInitialPassword } from '@/lib/auth/password-policy';
import { setAuthPasswordForProfile } from '@/lib/auth/update-password';
import { isValidUsername, normalizeUsername } from '@/lib/auth/username';
import { ensureStaffProfile } from '@/lib/staff/ensure-profile';
import { ensureSchoolCalendarSettings } from '@/lib/attendance/school-calendar';

export type SchoolApprovalStatus = 'pending' | 'approved' | 'rejected';

const DEFAULT_STUDENT_FIELDS = [
  { field_name: 'date_of_birth', field_label: 'Date of Birth', field_type: 'date', is_required: false, sort_order: 0 },
  { field_name: 'gender', field_label: 'Gender', field_type: 'select', options: ['Male', 'Female'], is_required: true, sort_order: 1 },
  { field_name: 'parent_email', field_label: 'Parent Email', field_type: 'email', is_required: true, sort_order: 2 },
  { field_name: 'parent_name', field_label: 'Parent Full Name', field_type: 'text', is_required: true, sort_order: 3 },
  { field_name: 'parent_phone', field_label: 'Parent Phone', field_type: 'phone', is_required: false, sort_order: 4 },
  { field_name: 'relationship', field_label: 'Relationship to Student', field_type: 'select', options: ['Mother', 'Father', 'Guardian'], is_required: true, sort_order: 5 },
];

const DEFAULT_TEACHER_FIELDS = [
  { field_name: 'phone', field_label: 'Phone Number', field_type: 'phone', is_required: false, sort_order: 0 },
  { field_name: 'subject', field_label: 'Subject Taught', field_type: 'text', is_required: false, sort_order: 1 },
  { field_name: 'qualification', field_label: 'Qualification', field_type: 'text', is_required: false, sort_order: 2 },
];

export type ProvisionSchoolInput = {
  name: string;
  address?: string | null;
  logo_url?: string | null;
  approval_status?: SchoolApprovalStatus;
  admin_username: string;
  admin_name: string;
  admin_phone?: string | null;
  admin_email?: string | null;
  admin_password?: string | null;
};

export type ProvisionSchoolResult =
  | {
      ok: true;
      school: Record<string, unknown>;
      admin_username: string;
      admin_password?: string;
    }
  | { ok: false; error: string; status?: number };

export async function provisionSchool(
  supabase: SupabaseClient,
  input: ProvisionSchoolInput
): Promise<ProvisionSchoolResult> {
  const normalizedUsername = normalizeUsername(input.admin_username);
  if (!isValidUsername(normalizedUsername)) {
    return {
      ok: false,
      error: 'Admin username must be 3–30 characters (letters, numbers, underscore only)',
      status: 400,
    };
  }

  const initialPassword = resolveInitialPassword(input.admin_password);
  if (!initialPassword) {
    return {
      ok: false,
      error: 'Admin default password is required (at least 6 characters)',
      status: 400,
    };
  }

  const normalizedEmail = input.admin_email?.trim()
    ? input.admin_email.toLowerCase().trim()
    : null;

  const { data: school, error: schoolError } = await supabase
    .from('schools')
    .insert({
      name: input.name.trim(),
      address: input.address || null,
      logo_url: input.logo_url || null,
      setup_completed: false,
      setup_step: 'classes',
      approval_status: input.approval_status || 'approved',
    })
    .select()
    .single();

  if (schoolError || !school) {
    console.error('[provision-school]', schoolError);
    return { ok: false, error: 'Failed to create school', status: 500 };
  }

  await ensureSchoolCalendarSettings(supabase, school.id);

  const rollbackSchool = async () => {
    await supabase.from('schools').delete().eq('id', school.id);
  };

  const studentFields = DEFAULT_STUDENT_FIELDS.map((f) => ({
    ...f,
    school_id: school.id,
    entity_type: 'student',
    options: f.options || null,
    placeholder: null,
    is_active: true,
  }));

  const teacherFields = DEFAULT_TEACHER_FIELDS.map((f) => ({
    ...f,
    school_id: school.id,
    entity_type: 'teacher',
    options: null,
    placeholder: null,
    is_active: true,
  }));

  const { error: fieldsError } = await supabase
    .from('school_custom_fields')
    .insert([...studentFields, ...teacherFields]);

  if (fieldsError) {
    await rollbackSchool();
    return { ok: false, error: 'Failed to set up school fields', status: 500 };
  }

  const { data: existingProfile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('username', normalizedUsername)
    .maybeSingle();

  let adminUserId: string;
  let adminPassword: string | undefined = initialPassword;

  if (existingProfile) {
    adminUserId = existingProfile.id;
    const { error: pwErr } = await setAuthPasswordForProfile(supabase, adminUserId, initialPassword, {
      createAuthIfMissing: true,
    });
    if (pwErr) {
      await rollbackSchool();
      return { ok: false, error: pwErr, status: 500 };
    }
  } else {
    const { userId, password, error: authErr } = await ensureAuthUser(supabase, {
      username: normalizedUsername,
      full_name: input.admin_name.trim(),
      password: initialPassword,
    });
    if (!userId) {
      await rollbackSchool();
      return {
        ok: false,
        error: `Failed to create admin account${authErr ? `: ${authErr}` : ''}`,
        status: 500,
      };
    }
    adminUserId = userId;
    adminPassword = password || initialPassword;
  }

  const { error: profileError } = await ensureUserProfile(supabase, {
    id: adminUserId,
    username: normalizedUsername,
    full_name: input.admin_name.trim(),
    phone: input.admin_phone || null,
    email: normalizedEmail,
  });

  if (profileError) {
    await rollbackSchool();
    return { ok: false, error: `Failed to save admin profile: ${profileError.message}`, status: 500 };
  }

  const { data: existingRole } = await supabase
    .from('user_school_roles')
    .select('id')
    .eq('user_id', adminUserId)
    .eq('school_id', school.id)
    .eq('role', 'school_admin')
    .maybeSingle();

  if (!existingRole) {
    const { error: roleError } = await supabase.from('user_school_roles').insert({
      user_id: adminUserId,
      school_id: school.id,
      role: 'school_admin',
      is_active: true,
    });

    if (roleError) {
      await rollbackSchool();
      return { ok: false, error: `Failed to assign admin role: ${roleError.message}`, status: 500 };
    }
  }

  await ensureStaffProfile(supabase, school.id, adminUserId);

  const defaultJobRoles = [
    { name: 'Accountant', slug: 'accountant', can_assign_class: false, sort_order: 0 },
    { name: 'Cleaner', slug: 'cleaner', can_assign_class: false, sort_order: 1 },
    { name: 'Driver', slug: 'driver', can_assign_class: false, sort_order: 2 },
    { name: 'Subject Teacher', slug: 'subject_teacher', can_assign_class: true, sort_order: 3 },
    { name: 'Class teacher', slug: 'class_teacher', can_assign_class: true, sort_order: 4 },
  ];
  await supabase.from('school_custom_roles').insert(
    defaultJobRoles.map((r) => ({ ...r, school_id: school.id, is_active: true }))
  );

  return {
    ok: true,
    school: {
      ...school,
      student_count: 0,
      staff_count: 1,
    },
    admin_username: normalizedUsername,
    admin_password: adminPassword,
  };
}
