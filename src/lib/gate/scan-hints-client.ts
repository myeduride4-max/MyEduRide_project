/** Apply scan API hints (toast + mode) on gate/admin scan UIs. */
export function applyScanHints(data: {
  scan_hints?: {
    message?: string | null;
    suggested_mode?: 'arrival' | 'departure' | null;
    already_complete?: boolean;
  };
}, opts: {
  toast: { info: (m: string) => void; error: (m: string) => void };
  setMode?: (m: 'arrival' | 'departure') => void;
  modeLabels?: { arrival: string; departure: string };
}) {
  const hints = data.scan_hints;
  if (!hints) return;

  if (hints.already_complete) {
    opts.toast.error('Already signed in and out today — no more scans allowed');
    return;
  }
  if (hints.message) {
    opts.toast.info(hints.message);
  }
  if (hints.suggested_mode === 'departure' && opts.setMode) {
    opts.setMode('departure');
  }
}

export function isActionBlocked(
  todayStatus: { has_arrival?: boolean; has_departure?: boolean; has_clock_in?: boolean; has_clock_out?: boolean } | null | undefined,
  mode: 'arrival' | 'departure',
  isStaff: boolean
): { blocked: boolean; message: string | null } {
  if (!todayStatus) return { blocked: false, message: null };

  const signedIn = isStaff ? todayStatus.has_clock_in : todayStatus.has_arrival;
  const signedOut = isStaff ? todayStatus.has_clock_out : todayStatus.has_departure;

  if (signedIn && signedOut) {
    return { blocked: true, message: 'Already signed in and out today — no more scans' };
  }
  if (mode === 'arrival' && signedIn) {
    return {
      blocked: true,
      message: isStaff ? 'Already signed in today' : 'Already checked in today',
    };
  }
  if (mode === 'departure') {
    if (!signedIn) {
      return { blocked: true, message: isStaff ? 'Must sign in first' : 'Must check in first' };
    }
    if (signedOut) {
      return { blocked: true, message: isStaff ? 'Already signed out today' : 'Already checked out today' };
    }
  }
  return { blocked: false, message: null };
}
