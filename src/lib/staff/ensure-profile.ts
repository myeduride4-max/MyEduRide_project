import type { SupabaseClient } from '@supabase/supabase-js';

export type StaffProfileRow = {
  id: string;
  user_id: string;
  school_id: string;
  staff_id_number: string | null;
  qr_code_data: string | null;
  photo_url: string | null;
};

/** Create gate-scan profile + ID number if missing (teachers added before profiles existed). */
export async function ensureStaffProfile(
  supabase: SupabaseClient,
  schoolId: string,
  userId: string
): Promise<StaffProfileRow | null> {
  const { data: existing } = await supabase
    .from('teacher_profiles')
    .select('id, user_id, school_id, staff_id_number, qr_code_data, photo_url')
    .eq('school_id', schoolId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing?.staff_id_number) return existing as StaffProfileRow;

  const staffIdNumber =
    existing?.staff_id_number ||
    `STF-${schoolId.slice(0, 4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  const qrCodeData = existing?.qr_code_data || `MYEDURIDE:STAFF:${staffIdNumber}`;

  const payload: Record<string, unknown> = {
    user_id: userId,
    school_id: schoolId,
    staff_id_number: staffIdNumber,
    qr_code_data: qrCodeData,
    photo_url: existing?.photo_url ?? null,
  };

  let { data, error } = await supabase
    .from('teacher_profiles')
    .upsert(payload, { onConflict: 'user_id,school_id' })
    .select('id, user_id, school_id, staff_id_number, qr_code_data, photo_url')
    .single();

  if (error && /custom_role_id/i.test(error.message)) {
    const retry = await supabase
      .from('teacher_profiles')
      .upsert(
        {
          user_id: userId,
          school_id: schoolId,
          staff_id_number: staffIdNumber,
          qr_code_data: qrCodeData,
          photo_url: existing?.photo_url ?? null,
        },
        { onConflict: 'user_id,school_id' }
      )
      .select('id, user_id, school_id, staff_id_number, qr_code_data, photo_url')
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    console.warn('[ensureStaffProfile]', error.message);
    return null;
  }

  return data as StaffProfileRow;
}
