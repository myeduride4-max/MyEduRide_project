// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { fetchData } from '@/lib/api';
import GateActivitiesReport from '@/components/gate/GateActivitiesReport';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function GateActivitiesReportPage() {
  const [schoolId, setSchoolId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const schoolData = await fetchData('get_school_admin_data', { role: 'school_admin' });
        setSchoolId(schoolData.school_id || '');
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-primary-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="page-shell max-w-3xl">
      <Link
        href="/dashboard/school-admin/reports"
        className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline mb-4 min-h-[44px]"
      >
        <ArrowLeft size={14} /> Reports
      </Link>
      <div className="page-header">
        <div>
          <p className="page-badge">Reports</p>
          <h1 className="page-title">Gate activities</h1>
          <p className="page-subtitle">
            Who was released, when, pickup person, and gate officer actions.
          </p>
        </div>
      </div>
      <div className="card-elevated p-5">
        <GateActivitiesReport schoolId={schoolId} />
      </div>
    </div>
  );
}
