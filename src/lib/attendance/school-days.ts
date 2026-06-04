import { isLagosWeekend } from '@/lib/attendance/lagos-dates';

/** Weekdays only — weekends and non-school days excluded unless gate override applies. */
export function isCountableSchoolDay(
  dateStr: string,
  nonSchoolDays?: ReadonlySet<string> | ReadonlyMap<string, unknown>,
  weekendDays: ReadonlySet<number> = new Set([0, 6]),
  gateOverrides?: ReadonlySet<string>
): boolean {
  if (gateOverrides?.has(dateStr)) return true;
  if (isLagosWeekend(dateStr, weekendDays)) return false;
  if (nonSchoolDays?.has(dateStr)) return false;
  return true;
}

export function filterCountableSchoolDays(
  dateStrings: string[],
  nonSchoolDays?: ReadonlySet<string> | ReadonlyMap<string, unknown>
): string[] {
  return dateStrings.filter((d) => isCountableSchoolDay(d, nonSchoolDays));
}
