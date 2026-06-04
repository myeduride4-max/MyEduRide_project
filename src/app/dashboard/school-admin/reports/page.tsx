// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { fetchData } from '@/lib/api';
import DetailedAttendanceReports from '@/components/attendance/DetailedAttendanceReports';
import Link from 'next/link';
import { ClipboardList, DoorOpen } from 'lucide-react';

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolId] = useState('');
  const [classes, setClasses] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const schoolData = await fetchData('get_school_admin_data', { role: 'school_admin' });
        if (!schoolData.school_id) {
          setLoading(false);
          return;
        }
        setSchoolId(schoolData.school_id);
        const res = await fetch(`/api/classes?school_id=${schoolData.school_id}`, { credentials: 'include' });
        const json = await res.json();
        setClasses(json.classes || []);
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
    <div className="page-shell max-w-5xl">
      <div className="page-header">
        <div>
          <p className="page-badge">Reports</p>
          <h1 className="page-title">Attendance report</h1>
          <p className="page-subtitle">Daily, weekly, and monthly summaries. Filter by class and date range.</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        <div className="card border-2 border-primary-200 bg-primary-50/40">
          <ClipboardList size={20} className="text-primary-600 mb-2" />
          <p className="font-semibold text-slate-900">Attendance report</p>
          <p className="text-xs text-slate-500 mt-1">Present, absent, late — by class</p>
        </div>
        <Link
          href="/dashboard/school-admin/reports/gate-activities"
          className="card hover:border-primary-200 hover:shadow-md transition-all"
        >
          <DoorOpen size={20} className="text-slate-600 mb-2" />
          <p className="font-semibold text-slate-900">Gate activities</p>
          <p className="text-xs text-slate-500 mt-1">Releases, check-in/out, pickup persons</p>
        </Link>
      </div>

      <div className="card-elevated p-5">
        <DetailedAttendanceReports schoolId={schoolId} classes={classes} title="General report (all classes)" />
      </div>
    </div>
  );
}
