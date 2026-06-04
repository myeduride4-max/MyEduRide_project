import type { SupabaseClient } from '@supabase/supabase-js';

export type GateActivityAction =
  | 'check_in'
  | 'check_out'
  | 'release'
  | 'manual_override'
  | 'clock_in'
  | 'clock_out';

export type GateActivityLogInput = {
  school_id: string;
  gate_officer_user_id: string;
  student_id?: string | null;
  action_type: GateActivityAction;
  pickup_person_name?: string | null;
  pickup_person_phone?: string | null;
  details?: Record<string, unknown>;
};

/** Persist gate officer actions to gate_activity_logs (schema-aligned). */
export async function writeGateActivityLog(
  supabase: SupabaseClient,
  entry: GateActivityLogInput
): Promise<void> {
  const { error } = await supabase.from('gate_activity_logs').insert({
    school_id: entry.school_id,
    gate_officer_user_id: entry.gate_officer_user_id,
    student_id: entry.student_id ?? null,
    action_type: entry.action_type,
    pickup_person_name: entry.pickup_person_name?.trim() || null,
    pickup_person_phone: entry.pickup_person_phone?.trim() || null,
    details: entry.details || {},
  });

  if (error) {
    console.warn('[gate_activity_logs]', entry.action_type, error.message);
  }
}
