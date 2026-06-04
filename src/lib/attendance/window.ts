/** How long a gate scan counts as "present" on live dashboards (ms). */
export const UI_PRESENT_WINDOW_MS = 12 * 60 * 60 * 1000;

/** Calendar day length for daily reports / grouping. */
export const ATTENDANCE_DAY_MS = 24 * 60 * 60 * 1000;

export function getUiPresentWindowStart(now = new Date()): Date {
  return new Date(now.getTime() - UI_PRESENT_WINDOW_MS);
}

export function isWithinUiPresentWindow(timestamp: string | Date, now = new Date()): boolean {
  const t = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  return t.getTime() >= getUiPresentWindowStart(now).getTime();
}

/** Local calendar day [start, end] for daily CSV / filters. */
export function getCalendarDayBounds(date = new Date()): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

export const ATTENDANCE_UI_NOTE =
  'Present/In comes from gate check-in today (Lagos time). Teachers do not mark attendance — only dismiss for pickup.';
