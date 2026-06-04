// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import AttendanceReportPanel from '@/components/attendance/AttendanceReportPanel';

export default function SuperAdminReportsPage() {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/schools/list', { cache: 'no-store', credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setSchools(d.schools || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6 pt-14 flex items-center justify-center min-h-[40vh]">
        <div className="animate-pulse text-primary-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 pt-14 md:pt-6 max-w-xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Attendance reports</h1>
      <p className="text-sm text-slate-500 mb-6">
        Export daily or full history for any school. Data is never deleted from the database.
      </p>
      <div className="card-elevated p-5">
        <AttendanceReportPanel showSchoolPicker schools={schools} />
      </div>
    </div>
  );
}
