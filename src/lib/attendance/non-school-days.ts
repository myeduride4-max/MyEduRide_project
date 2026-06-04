import type { SupabaseClient } from '@supabase/supabase-js';

export type NonSchoolDay = {
  calendar_date: string;
  day_type: string;
  title: string;
};

export async function fetchNonSchoolDaysInRange(
  supabase: SupabaseClient,
  schoolId: string,
  startDateStr: string,
  endDateStr: string
): Promise<Map<string, NonSchoolDay>> {
  const { data, error } = await supabase
    .from('school_non_school_days')
    .select('calendar_date, day_type, title')
    .eq('school_id', schoolId)
    .gte('calendar_date', startDateStr)
    .lte('calendar_date', endDateStr);

  if (error) {
    if (/school_non_school_days|does not exist/i.test(error.message)) {
      return new Map();
    }
    console.warn('[non-school-days]', error.message);
    return new Map();
  }

  const map = new Map<string, NonSchoolDay>();
  for (const row of data || []) {
    const key = String(row.calendar_date).slice(0, 10);
    map.set(key, {
      calendar_date: key,
      day_type: row.day_type,
      title: row.title,
    });
  }
  return map;
}
