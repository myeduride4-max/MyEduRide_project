import type { SupabaseClient } from '@supabase/supabase-js';

export type StaffSignLogRow = {
  id: string;
  type: string;
  timestamp: string;
  user_id: string;
  record_source?: string | null;
  full_name: string;
};

/** Staff gate scans for sign-in/out log (resilient if optional columns missing). */
export async function fetchStaffSignLogRows(
  supabase: SupabaseClient,
  schoolId: string,
  startIso: string,
  endIso: string
): Promise<StaffSignLogRow[]> {
  const attempts = [
    'id, type, timestamp, user_id, record_source, user:user_profiles(full_name)',
    'id, type, timestamp, user_id, user:user_profiles(full_name)',
    'id, type, timestamp, user_id',
  ];

  type RawRow = {
    id: string;
    type: string;
    timestamp: string;
    user_id: string;
    record_source?: string | null;
    user?: { full_name?: string } | { full_name?: string }[];
  };

  let rows: RawRow[] | null = null;

  for (const select of attempts) {
    const { data, error } = await supabase
      .from('staff_attendance')
      .select(select)
      .eq('school_id', schoolId)
      .gte('timestamp', startIso)
      .lte('timestamp', endIso)
      .order('timestamp', { ascending: false });

    if (!error && data) {
      rows = data as unknown as RawRow[];
      break;
    }
    if (!/record_source|user_profiles|relationship/i.test(error.message)) {
      console.warn('[staff-sign-log]', error.message);
      return [];
    }
  }

  if (!rows?.length) return [];

  const needsNames = rows.some((r) => {
    const u = Array.isArray(r.user) ? r.user[0] : r.user;
    return !u?.full_name;
  });

  const nameByUser: Record<string, string> = {};
  if (needsNames) {
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name')
      .in('id', userIds);
    for (const p of profiles || []) {
      nameByUser[p.id] = p.full_name || 'Staff';
    }
  }

  return rows.map((r) => {
    const embedded = Array.isArray(r.user) ? r.user[0] : r.user;
    return {
      id: r.id,
      type: r.type,
      timestamp: r.timestamp,
      user_id: r.user_id,
      record_source: r.record_source,
      full_name: embedded?.full_name || nameByUser[r.user_id] || 'Staff',
    };
  });
}
