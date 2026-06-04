// @ts-nocheck
'use client';

export default function TodayScanStatusBanner({ todayStatus, isStaff = false }) {
  if (!todayStatus) return null;

  const signedIn = isStaff ? todayStatus.has_clock_in : todayStatus.has_arrival;
  const signedOut = isStaff ? todayStatus.has_clock_out : todayStatus.has_departure;
  const inLabel = isStaff ? 'Signed in' : 'Checked in';
  const outLabel = isStaff ? 'Signed out' : 'Checked out';

  return (
    <div className="grid grid-cols-2 gap-2 mb-4">
      <div
        className={`rounded-xl px-3 py-2 text-center text-xs font-bold border ${
          signedIn
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-slate-50 border-slate-200 text-slate-500'
        }`}
      >
        {inLabel}: {signedIn ? 'YES' : 'No'}
      </div>
      <div
        className={`rounded-xl px-3 py-2 text-center text-xs font-bold border ${
          signedOut
            ? 'bg-orange-50 border-orange-200 text-orange-800'
            : 'bg-slate-50 border-slate-200 text-slate-500'
        }`}
      >
        {outLabel}: {signedOut ? 'YES' : 'No'}
      </div>
    </div>
  );
}
