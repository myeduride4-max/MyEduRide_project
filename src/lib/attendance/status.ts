/** Normalized day status for parent history and reports UI. */
export type DayAttendanceStatus =
  | 'on_time'
  | 'late'
  | 'absent'
  | 'weekend'
  | 'upcoming'
  | 'excluded';

export type ArrivalLike = {
  status?: string | null;
  minutes_late?: number | null;
  timestamp?: string;
} | null;

/** Gate may store on_time/late; treat minutes_late as late when status is wrong. */
export function normalizeArrivalStatus(arrival: ArrivalLike): 'on_time' | 'late' | null {
  if (!arrival) return null;
  const raw = (arrival.status || '').toLowerCase();
  if (raw === 'late' || (arrival.minutes_late != null && arrival.minutes_late > 0)) {
    return 'late';
  }
  if (raw === 'on_time' || raw === 'present' || arrival.timestamp) {
    return 'on_time';
  }
  return 'on_time';
}

export function resolveCalendarDayStatus(
  dayKey: string,
  arrival: ArrivalLike,
  opts: { isWeekend: boolean; todayLagos: string; isExcluded?: boolean }
): DayAttendanceStatus {
  if (opts.isExcluded) return 'excluded';
  if (opts.isWeekend) return 'weekend';
  if (dayKey > opts.todayLagos) return 'upcoming';
  const normalized = normalizeArrivalStatus(arrival);
  if (!normalized) return 'absent';
  return normalized;
}

export const DAY_STATUS_LABELS: Record<DayAttendanceStatus, string> = {
  on_time: 'Present',
  late: 'Late',
  absent: 'Absent',
  weekend: 'Weekend',
  upcoming: 'Upcoming',
  excluded: 'No school',
};

export function dayStatusColor(status: DayAttendanceStatus): 'green' | 'yellow' | 'red' | 'gray' {
  if (status === 'late') return 'yellow';
  if (status === 'on_time') return 'green';
  if (status === 'absent') return 'red';
  return 'gray';
}
