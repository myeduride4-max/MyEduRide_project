import { APP_TIMEZONE, lagosDayBounds } from '@/lib/timezone';

/** Calendar date YYYY-MM-DD in Lagos for a stored UTC timestamp. */
export function timestampToLagosDateKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(new Date(iso));
}

export function lagosDayBoundsFromDateStr(dateStr: string): { startIso: string; endIso: string } {
  const anchor = new Date(`${dateStr}T12:00:00+01:00`);
  const { startIso, endIso } = lagosDayBounds(anchor);
  return { startIso, endIso };
}

export function addDaysToLagosDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00+01:00`);
  d.setTime(d.getTime() + days * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(d);
}

export function getLagosWeekday(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00+01:00`);
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: APP_TIMEZONE, weekday: 'short' }).format(d);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

export function lagosWeekRange(anchorDateStr: string): { startDateStr: string; endDateStr: string } {
  const weekday = getLagosWeekday(anchorDateStr);
  const diffToMon = weekday === 0 ? -6 : 1 - weekday;
  const startDateStr = addDaysToLagosDate(anchorDateStr, diffToMon);
  const endDateStr = addDaysToLagosDate(startDateStr, 6);
  return { startDateStr, endDateStr };
}

export function lagosMonthRange(anchorDateStr: string): { startDateStr: string; endDateStr: string } {
  const [y, m] = anchorDateStr.split('-').map(Number);
  const startDateStr = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const endDateStr = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { startDateStr, endDateStr };
}

/** Full calendar month from YYYY-MM (no day in picker). */
export function lagosMonthRangeFromYm(monthYm: string): { startDateStr: string; endDateStr: string } {
  return lagosMonthRange(`${monthYm}-01`);
}

export function lagosDateStringsInRange(startDateStr: string, endDateStr: string): string[] {
  const days: string[] = [];
  let cur = startDateStr;
  while (cur <= endDateStr) {
    days.push(cur);
    if (cur === endDateStr) break;
    cur = addDaysToLagosDate(cur, 1);
  }
  return days;
}

export type LagosReportRange = {
  startDateStr: string;
  endDateStr: string;
  rangeStartIso: string;
  rangeEndIso: string;
};

export function resolveLagosReportRange(
  type: string,
  dateParam: string,
  yearParam?: string | null,
  termParam?: string | null
): LagosReportRange {
  if (type === 'daily') {
    const { startIso, endIso } = lagosDayBoundsFromDateStr(dateParam);
    return { startDateStr: dateParam, endDateStr: dateParam, rangeStartIso: startIso, rangeEndIso: endIso };
  }

  if (type === 'weekly') {
    const { startDateStr, endDateStr } = lagosWeekRange(dateParam);
    const { startIso } = lagosDayBoundsFromDateStr(startDateStr);
    const { endIso } = lagosDayBoundsFromDateStr(endDateStr);
    return { startDateStr, endDateStr, rangeStartIso: startIso, rangeEndIso: endIso };
  }

  if (type === 'monthly') {
    const { startDateStr, endDateStr } = lagosMonthRange(dateParam);
    const { startIso } = lagosDayBoundsFromDateStr(startDateStr);
    const { endIso } = lagosDayBoundsFromDateStr(endDateStr);
    return { startDateStr, endDateStr, rangeStartIso: startIso, rangeEndIso: endIso };
  }

  // yearly / term (parent history)
  const year = yearParam ? parseInt(yearParam, 10) : parseInt(dateParam.split('-')[0], 10);

  if (termParam) {
    const term = parseInt(termParam, 10);
    const termRanges: Record<number, [number, number, number, number]> = {
      1: [8, 1, 11, 30],
      2: [0, 1, 3, 30],
      3: [4, 1, 7, 31],
    };
    const [sm, sd, em, ed] = termRanges[term] || [0, 1, 11, 31];
    const termYear = term === 1 ? year : year + 1;
    const rangeStart = new Date(term === 1 ? year : termYear, sm, sd, 0, 0, 0, 0);
    const rangeEnd = new Date(termYear, em, ed, 23, 59, 59, 999);
    const startDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(rangeStart);
    const endDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(rangeEnd);
    const { startIso } = lagosDayBoundsFromDateStr(startDateStr);
    const { endIso } = lagosDayBoundsFromDateStr(endDateStr);
    return { startDateStr, endDateStr, rangeStartIso: startIso, rangeEndIso: endIso };
  }

  const startDateStr = `${year}-01-01`;
  const endDateStr = `${year}-12-31`;
  const { startIso } = lagosDayBoundsFromDateStr(startDateStr);
  const { endIso } = lagosDayBoundsFromDateStr(endDateStr);
  return { startDateStr, endDateStr, rangeStartIso: startIso, rangeEndIso: endIso };
}

/** Weekday 0=Sun … 6=Sat for a Lagos calendar date string. */
export function isLagosWeekend(
  dateStr: string,
  weekendDays: ReadonlySet<number> = new Set([0, 6])
): boolean {
  return weekendDays.has(getLagosWeekday(dateStr));
}

/** Default Sat/Sun weekend check (Lagos). */
export function lagosWeekend(dateStr: string): boolean {
  return isLagosWeekend(dateStr);
}
