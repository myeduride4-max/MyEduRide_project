import type { SupabaseClient } from '@supabase/supabase-js';
import { TIME_FIELDS } from '@/lib/time-input';

const BASE_SELECT =
  'id, name, address, logo_url, principal_signature_url, welcome_message, primary_color, secondary_color, timezone, setup_completed, setup_step';

const TIME_SELECT = TIME_FIELDS.join(', ');

const FULL_SELECT = `${BASE_SELECT}, ${TIME_SELECT}`;

function isMissingColumnError(message: string): boolean {
  return /column|does not exist|schema cache/i.test(message);
}

/** Load school row; falls back if gate-hour columns are missing on DB. */
export async function fetchSchoolSettings(
  supabase: SupabaseClient,
  schoolId: string
): Promise<{ data: Record<string, unknown> | null; error: string | null; timeColumnsAvailable: boolean }> {
  const full = await supabase.from('schools').select(FULL_SELECT).eq('id', schoolId).single();
  if (!full.error && full.data) {
    return { data: full.data as unknown as unknown as Record<string, unknown>, error: null, timeColumnsAvailable: true };
  }

  if (full.error && isMissingColumnError(full.error.message)) {
    const base = await supabase.from('schools').select(BASE_SELECT).eq('id', schoolId).single();
    if (base.error) return { data: null, error: base.error.message, timeColumnsAvailable: false };
    return {
      data: base.data as unknown as unknown as Record<string, unknown>,
      error: null,
      timeColumnsAvailable: false,
    };
  }

  return { data: null, error: full.error?.message || 'School not found', timeColumnsAvailable: false };
}

/** Update school; retries without time fields if columns missing. */
export async function updateSchoolSettings(
  supabase: SupabaseClient,
  schoolId: string,
  updates: Record<string, unknown>
): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
  migrationRequired?: boolean;
}> {
  const timeKeys = TIME_FIELDS.filter((f) => updates[f] !== undefined);
  const nonTimeUpdates = { ...updates };
  for (const f of TIME_FIELDS) delete nonTimeUpdates[f];

  const payload = { ...nonTimeUpdates };
  for (const f of timeKeys) {
    if (updates[f] !== undefined) payload[f] = updates[f];
  }

  const full = await supabase
    .from('schools')
    .update(payload)
    .eq('id', schoolId)
    .select(FULL_SELECT)
    .single();

  if (!full.error && full.data) {
    return { data: full.data as unknown as Record<string, unknown>, error: null };
  }

  if (full.error && timeKeys.length > 0 && isMissingColumnError(full.error.message)) {
    if (Object.keys(nonTimeUpdates).length === 0) {
      return {
        data: null,
        error: 'Gate hour columns missing. Run supabase/schema.sql in Supabase SQL Editor.',
        migrationRequired: true,
      };
    }
    const base = await supabase
      .from('schools')
      .update(nonTimeUpdates)
      .eq('id', schoolId)
      .select(BASE_SELECT)
      .single();
    if (base.error) return { data: null, error: base.error.message };
    return {
      data: base.data as unknown as unknown as Record<string, unknown>,
      error: null,
      migrationRequired: true,
    };
  }

  return { data: null, error: full.error?.message || 'Update failed' };
}
