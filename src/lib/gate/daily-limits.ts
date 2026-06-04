import type { SupabaseClient } from '@supabase/supabase-js';
import { lagosDayBounds } from '@/lib/timezone';

export type TodayGateStatus = {
  has_arrival: boolean;
  has_departure: boolean;
};

export type GateActionKind = 'arrival' | 'departure';

export type GateValidation = {
  allowed: boolean;
  error?: string;
  code?: 'already_in' | 'already_out' | 'must_check_in_first' | 'complete';
  suggested_mode?: GateActionKind;
};

async function countToday(
  supabase: SupabaseClient,
  table: 'attendance_records' | 'staff_attendance',
  filters: Record<string, string>,
  type: string
): Promise<number> {
  const { startIso, endIso } = lagosDayBounds();
  let q = supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('type', type)
    .gte('timestamp', startIso)
    .lte('timestamp', endIso);

  for (const [k, v] of Object.entries(filters)) {
    q = q.eq(k, v);
  }

  const { count, error } = await q;
  if (error) {
    console.warn('[daily-limits] countToday', error.message);
    return 0;
  }
  return count ?? 0;
}

export async function getStudentTodayStatus(
  supabase: SupabaseClient,
  schoolId: string,
  studentId: string
): Promise<TodayGateStatus> {
  const arrivals = await countToday(
    supabase,
    'attendance_records',
    { school_id: schoolId, student_id: studentId },
    'arrival'
  );
  const departures = await countToday(
    supabase,
    'attendance_records',
    { school_id: schoolId, student_id: studentId },
    'departure'
  );
  return {
    has_arrival: arrivals > 0,
    has_departure: departures > 0,
  };
}

export async function getStaffTodayStatus(
  supabase: SupabaseClient,
  schoolId: string,
  userId: string
): Promise<{ has_clock_in: boolean; has_clock_out: boolean }> {
  const ins = await countToday(
    supabase,
    'staff_attendance',
    { school_id: schoolId, user_id: userId },
    'clock_in'
  );
  const outs = await countToday(
    supabase,
    'staff_attendance',
    { school_id: schoolId, user_id: userId },
    'clock_out'
  );
  return {
    has_clock_in: ins > 0,
    has_clock_out: outs > 0,
  };
}

export function validateStudentGateAction(
  status: TodayGateStatus,
  action: GateActionKind
): GateValidation {
  if (action === 'arrival') {
    if (status.has_arrival) {
      return {
        allowed: false,
        code: status.has_departure ? 'complete' : 'already_in',
        error: status.has_departure
          ? 'Already checked in and out today — no more scans allowed'
          : 'Already checked in today — switch to Check out',
        suggested_mode: status.has_departure ? undefined : 'departure',
      };
    }
    return { allowed: true };
  }

  if (!status.has_arrival) {
    return {
      allowed: false,
      code: 'must_check_in_first',
      error: 'Not checked in yet — check in first',
      suggested_mode: 'arrival',
    };
  }
  if (status.has_departure) {
    return {
      allowed: false,
      code: 'already_out',
      error: 'Already checked out today — no more scans allowed',
    };
  }
  return { allowed: true };
}

export function validateStaffGateAction(
  status: { has_clock_in: boolean; has_clock_out: boolean },
  action: GateActionKind
): GateValidation {
  if (action === 'arrival') {
    if (status.has_clock_in) {
      return {
        allowed: false,
        code: status.has_clock_out ? 'complete' : 'already_in',
        error: status.has_clock_out
          ? 'Already signed in and out today — no more scans allowed'
          : 'Already signed in today — switch to Sign out',
        suggested_mode: status.has_clock_out ? undefined : 'departure',
      };
    }
    return { allowed: true };
  }

  if (!status.has_clock_in) {
    return {
      allowed: false,
      code: 'must_check_in_first',
      error: 'Not signed in yet — sign in first',
      suggested_mode: 'arrival',
    };
  }
  if (status.has_clock_out) {
    return {
      allowed: false,
      code: 'already_out',
      error: 'Already signed out today — no more scans allowed',
    };
  }
  return { allowed: true };
}
