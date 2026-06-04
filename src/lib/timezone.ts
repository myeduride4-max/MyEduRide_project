/** Nigeria (WAT, UTC+1) — store UTC in DB, display in Africa/Lagos. */

export const APP_TIMEZONE = 'Africa/Lagos';

export function nowUtcIso(): string {
  return new Date().toISOString();
}

/** Calendar date YYYY-MM-DD in Lagos */
export function todayInLagos(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(new Date());
}

/** Start/end of calendar day in Lagos as UTC ISO strings (for DB range queries). */
export function lagosDayBounds(date = new Date()): {
  dateStr: string;
  startIso: string;
  endIso: string;
} {
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(date);
  const startIso = new Date(`${dateStr}T00:00:00+01:00`).toISOString();
  const endIso = new Date(`${dateStr}T23:59:59.999+01:00`).toISOString();
  return { dateStr, startIso, endIso };
}

export function formatTimeLagos(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-NG', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: APP_TIMEZONE,
  });
}

export function formatDateTimeLagos(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: APP_TIMEZONE,
  });
}

export function formatDateLagos(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-NG', {
    dateStyle: 'medium',
    timeZone: APP_TIMEZONE,
  });
}

/** Parse school TIME column against today's Lagos date for late checks */
export function nigeriaNowParts(): { hours: number; minutes: number; dateStr: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '0';
  return {
    hours: parseInt(get('hour'), 10),
    minutes: parseInt(get('minute'), 10),
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

export function minutesAfterThreshold(threshold: string): number | null {
  const [h, m] = threshold.split(':').map(Number);
  const { hours, minutes } = nigeriaNowParts();
  if (hours < h || (hours === h && minutes <= m)) return null;
  return (hours - h) * 60 + (minutes - m);
}

export function isLateByThreshold(threshold: string): boolean {
  return minutesAfterThreshold(threshold) !== null;
}

/** Minutes late for a stored clock-in / arrival timestamp (Lagos local time). */
export function minutesLateAtTimestamp(iso: string, threshold: string): number | null {
  const [th, tm] = threshold.split(':').map(Number);
  if (Number.isNaN(th) || Number.isNaN(tm)) return null;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));

  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value || '0', 10);
  const hours = get('hour');
  const minutes = get('minute');

  if (hours < th || (hours === th && minutes <= tm)) return null;
  return (hours - th) * 60 + (minutes - tm);
}

export function isLateAtTimestamp(iso: string, threshold: string): boolean {
  const m = minutesLateAtTimestamp(iso, threshold);
  return m != null && m > 0;
}
