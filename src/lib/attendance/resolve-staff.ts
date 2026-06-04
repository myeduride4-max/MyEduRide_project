import type { SupabaseClient } from '@supabase/supabase-js';
import { scanLookupValues } from '@/lib/attendance/resolve-scan';

export type ResolvedStaff = {
  id: string;
  user_id: string;
  staff_id_number: string | null;
  photo_url: string | null;
  full_name: string;
  role_label: string;
};

/** Find staff profile (teacher / gate / admin) by QR or staff ID number. */
export async function resolveStaffProfile(
  supabase: SupabaseClient,
  schoolId: string,
  scanOrId: string
): Promise<ResolvedStaff | null> {
  const candidates = scanLookupValues(scanOrId);

  for (const value of candidates) {
    const { data: byQr } = await supabase
      .from('teacher_profiles')
      .select('id, user_id, staff_id_number, photo_url, user:user_profiles(full_name)')
      .eq('school_id', schoolId)
      .eq('qr_code_data', value)
      .maybeSingle();

    if (byQr?.id) return mapStaffRow(byQr);

    const { data: byNum } = await supabase
      .from('teacher_profiles')
      .select('id, user_id, staff_id_number, photo_url, user:user_profiles(full_name)')
      .eq('school_id', schoolId)
      .eq('staff_id_number', value)
      .maybeSingle();

    if (byNum?.id) return mapStaffRow(byNum);
  }

  return null;
}

function mapStaffRow(row: {
  id: string;
  user_id: string;
  staff_id_number: string | null;
  photo_url: string | null;
  user: unknown;
}): ResolvedStaff {
  const user = Array.isArray(row.user) ? row.user[0] : row.user;
  const fullName = (user as { full_name?: string })?.full_name || 'Staff';

  return {
    id: row.id,
    user_id: row.user_id,
    staff_id_number: row.staff_id_number,
    photo_url: row.photo_url,
    full_name: fullName,
    role_label: 'Staff',
  };
}

export async function resolveStaffRoleLabel(
  supabase: SupabaseClient,
  schoolId: string,
  userId: string
): Promise<string> {
  const { data: profile } = await supabase
    .from('teacher_profiles')
    .select('custom_role:school_custom_roles(name)')
    .eq('school_id', schoolId)
    .eq('user_id', userId)
    .maybeSingle();

  const custom = profile?.custom_role as unknown;
  let customName: string | undefined;
  if (Array.isArray(custom)) customName = (custom[0] as { name?: string })?.name;
  else if (custom && typeof custom === 'object') customName = (custom as { name?: string }).name;
  if (customName) return customName;

  const { data } = await supabase
    .from('user_school_roles')
    .select('role')
    .eq('school_id', schoolId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (!data?.role) return 'Staff';
  if (data.role === 'staff') return 'Staff';
  return data.role.replace(/_/g, ' ');
}
