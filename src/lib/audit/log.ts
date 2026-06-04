import type { SupabaseClient } from '@supabase/supabase-js';

export type AuditLogInput = {
  school_id?: string | null;
  actor_user_id: string;
  target_user_id?: string | null;
  student_id?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  details?: Record<string, unknown>;
};

/** Best-effort audit row (service role). Failures are logged only. */
export async function writeAuditLog(
  supabase: SupabaseClient,
  entry: AuditLogInput
): Promise<void> {
  const { error } = await supabase.from('audit_logs').insert({
    school_id: entry.school_id || null,
    actor_user_id: entry.actor_user_id,
    target_user_id: entry.target_user_id || null,
    student_id: entry.student_id || null,
    action: entry.action,
    entity_type: entry.entity_type || null,
    entity_id: entry.entity_id || null,
    details: entry.details || {},
  });

  if (error) {
    console.warn('[audit]', entry.action, error.message);
  }
}
