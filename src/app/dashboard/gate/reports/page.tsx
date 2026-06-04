// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { fetchData } from '@/lib/api';
import AttendanceSignLog from '@/components/attendance/AttendanceSignLog';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function GateReportsPage() {
  const [schoolId, setSchoolId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchData('get_school_admin_data', { role: 'gate_officer' });
        setSchoolId(data.school_id || '');
      } catch {
        /* ignore */
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-primary-600">Loading…</div>
      </div>
    );
  }

  return (
    <div className="page-shell max-w-lg mx-auto pt-14 pb-8">
      <Link href="/dashboard/gate" className="inline-flex items-center gap-2 text-sm text-slate-500 mb-4">
        <ArrowLeft size={16} /> Back to gate
      </Link>
      <AttendanceSignLog schoolId={schoolId} title="Today&apos;s sign in / out" />
    </div>
  );
}
