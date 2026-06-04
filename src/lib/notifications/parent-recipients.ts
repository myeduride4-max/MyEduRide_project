import type { SupabaseClient } from '@supabase/supabase-js';

export type ParentRecipient = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
};

function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && value.includes('@') && value.trim().length > 3;
}

/** All parent contacts for a student — profile email plus custom_fields.parent_email fallback. */
export async function getParentRecipientsForStudent(
  supabase: SupabaseClient,
  studentId: string
): Promise<ParentRecipient[]> {
  const { data: student } = await supabase
    .from('students')
    .select('custom_fields')
    .eq('id', studentId)
    .maybeSingle();

  const customEmail = isValidEmail(student?.custom_fields?.parent_email)
    ? String(student.custom_fields.parent_email).toLowerCase().trim()
    : null;
  const customName =
    typeof student?.custom_fields?.parent_name === 'string'
      ? student.custom_fields.parent_name.trim()
      : null;
  const customPhone =
    typeof student?.custom_fields?.parent_phone === 'string'
      ? student.custom_fields.parent_phone.trim()
      : null;

  const { data: parentLinks } = await supabase
    .from('student_parents')
    .select('parent_user_id')
    .eq('student_id', studentId);

  const parentIds = (parentLinks || []).map((l) => l.parent_user_id).filter(Boolean);
  const byUserId = new Map<string, ParentRecipient>();

  if (parentIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, phone')
      .in('id', parentIds);

    for (const profile of profiles || []) {
      byUserId.set(profile.id, {
        user_id: profile.id,
        email: isValidEmail(profile.email) ? profile.email.toLowerCase().trim() : null,
        full_name: profile.full_name || null,
        phone: profile.phone || null,
      });
    }
  }

  if (customEmail) {
    const existingWithEmail = [...byUserId.values()].find((p) => p.email === customEmail);
    if (!existingWithEmail) {
      const primary = [...byUserId.values()][0];
      if (primary && !primary.email) {
        primary.email = customEmail;
        if (!primary.full_name && customName) primary.full_name = customName;
        if (!primary.phone && customPhone) primary.phone = customPhone;
      } else if (!primary) {
        byUserId.set(`custom-${customEmail}`, {
          user_id: parentIds[0] || '',
          email: customEmail,
          full_name: customName,
          phone: customPhone,
        });
      }
    }
  }

  return [...byUserId.values()].filter((p) => p.user_id || p.email);
}
