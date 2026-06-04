'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Gate activity log moved under Reports → Gate activities. */
export default function GateLogRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/school-admin/reports/gate-activities');
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
      Redirecting to gate activities report…
    </div>
  );
}
