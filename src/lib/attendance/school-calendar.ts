import type { SupabaseClient } from '@supabase/supabase-js';
import { getLagosWeekday } from '@/lib/attendance/lagos-dates';
import { fetchNonSchoolDaysInRange, type NonSchoolDay } from '@/lib/attendance/non-school-days';

export type SchoolCalendarContext = {
  weekendDays: ReadonlySet<number>;
  nonSchoolDays: Map<string, NonSchoolDay>;
  gateOverrides: ReadonlySet<string>;
};

const DEFAULT_WEEKEND_DAYS = new Set([0, 6]);

export function isWeekendDay(dateStr: string, weekendDays: ReadonlySet<number>): boolean {
  return weekendDays.has(getLagosWeekday(dateStr));
}

export function isCountableSchoolDayWithContext(
  dateStr: string,
  ctx: Pick<SchoolCalendarContext, 'weekendDays' | 'nonSchoolDays' | 'gateOverrides'>
): boolean {
  if (ctx.gateOverrides.has(dateStr)) return true;
  if (isWeekendDay(dateStr, ctx.weekendDays)) return false;
  if (ctx.nonSchoolDays.has(dateStr)) return false;
  return true;
}

export async function fetchSchoolCalendarContext(
  supabase: SupabaseClient,
  schoolId: string,
  startDateStr: string,
  endDateStr: string
): Promise<SchoolCalendarContext> {
  const [settingsRes, nonSchoolDays, overridesRes] = await Promise.all([
    supabase
      .from('school_calendar_settings')
      .select('weekend_days')
      .eq('school_id', schoolId)
      .maybeSingle(),
    fetchNonSchoolDaysInRange(supabase, schoolId, startDateStr, endDateStr),
    supabase
      .from('gate_day_overrides')
      .select('override_date')
      .eq('school_id', schoolId)
      .gte('override_date', startDateStr)
      .lte('override_date', endDateStr),
  ]);

  const rawWeekends = settingsRes.data?.weekend_days;
  const weekendDays = new Set<number>(
    Array.isArray(rawWeekends) && rawWeekends.length > 0 ? rawWeekends : [...DEFAULT_WEEKEND_DAYS]
  );

  const gateOverrides = new Set<string>();
  for (const row of overridesRes.data || []) {
    gateOverrides.add(String(row.override_date).slice(0, 10));
  }

  return { weekendDays, nonSchoolDays, gateOverrides };
}

export async function ensureSchoolCalendarSettings(
  supabase: SupabaseClient,
  schoolId: string
): Promise<void> {
  await supabase
    .from('school_calendar_settings')
    .upsert({ school_id: schoolId, weekend_days: [0, 6] }, { onConflict: 'school_id' });
}
