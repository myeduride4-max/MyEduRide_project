import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchSchoolCalendarContext,
  isCountableSchoolDayWithContext,
  isWeekendDay,
} from '@/lib/attendance/school-calendar';
import { todayInLagos } from '@/lib/timezone';

export type GateDayStatus = {
  date: string;
  gate_open: boolean;
  reason: string | null;
  label: string | null;
  has_override: boolean;
};

/** Whether gate check-in/out and pickup flows are allowed today. */
export async function getGateDayStatus(
  supabase: SupabaseClient,
  schoolId: string,
  dateStr: string = todayInLagos()
): Promise<GateDayStatus> {
  const ctx = await fetchSchoolCalendarContext(supabase, schoolId, dateStr, dateStr);

  if (ctx.gateOverrides.has(dateStr)) {
    const { data: override } = await supabase
      .from('gate_day_overrides')
      .select('reason')
      .eq('school_id', schoolId)
      .eq('override_date', dateStr)
      .maybeSingle();

    return {
      date: dateStr,
      gate_open: true,
      reason: 'override',
      label: override?.reason || 'Admin override — gate open',
      has_override: true,
    };
  }

  if (isWeekendDay(dateStr, ctx.weekendDays)) {
    return {
      date: dateStr,
      gate_open: false,
      reason: 'weekend',
      label: 'Weekend — no school',
      has_override: false,
    };
  }

  const holiday = ctx.nonSchoolDays.get(dateStr);
  if (holiday) {
    return {
      date: dateStr,
      gate_open: false,
      reason: 'holiday',
      label: holiday.title || 'Non-school day',
      has_override: false,
    };
  }

  if (!isCountableSchoolDayWithContext(dateStr, ctx)) {
    return {
      date: dateStr,
      gate_open: false,
      reason: 'closed',
      label: 'School closed today',
      has_override: false,
    };
  }

  return {
    date: dateStr,
    gate_open: true,
    reason: null,
    label: null,
    has_override: false,
  };
}

export async function assertGateDayOpen(
  supabase: SupabaseClient,
  schoolId: string,
  dateStr: string = todayInLagos()
): Promise<{ ok: true } | { ok: false; status: GateDayStatus }> {
  const status = await getGateDayStatus(supabase, schoolId, dateStr);
  if (!status.gate_open) {
    return { ok: false, status };
  }
  return { ok: true };
}
