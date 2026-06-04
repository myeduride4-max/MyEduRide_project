import type { SupabaseClient } from '@supabase/supabase-js';
import { scanLookupValues } from '@/lib/attendance/resolve-scan';

/** Find active student by qr_code_data or student_id_number within a school. */
export async function resolveStudentId(
  supabase: SupabaseClient,
  schoolId: string,
  scanOrId: string
): Promise<string | null> {
  const candidates = scanLookupValues(scanOrId);
  for (const value of candidates) {
    const { data: byQr } = await supabase
      .from('students')
      .select('id')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .eq('qr_code_data', value)
      .maybeSingle();
    if (byQr?.id) return byQr.id;

    const { data: byNum } = await supabase
      .from('students')
      .select('id')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .eq('student_id_number', value)
      .maybeSingle();
    if (byNum?.id) return byNum.id;
  }
  return null;
}
