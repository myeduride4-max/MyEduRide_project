import { minutesLateAtTimestamp } from '@/lib/timezone';

export type StaffDayStatus = 'present' | 'late' | 'absent' | 'excluded';

export function staffStatusFromClockIn(
  clockInIso: string | null | undefined,
  lateThreshold: string
): { status: StaffDayStatus; minutes_late: number | null } {
  if (!clockInIso) return { status: 'absent', minutes_late: null };
  const minutes_late = minutesLateAtTimestamp(clockInIso, lateThreshold);
  if (minutes_late != null && minutes_late > 0) {
    return { status: 'late', minutes_late };
  }
  return { status: 'present', minutes_late: null };
}
