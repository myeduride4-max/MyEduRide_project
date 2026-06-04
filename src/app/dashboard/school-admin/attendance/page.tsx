// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { fetchData } from '@/lib/api';
import DetailedAttendanceReports from '@/components/attendance/DetailedAttendanceReports';
import AttendanceSignLog from '@/components/attendance/AttendanceSignLog';

export default function AttendanceReportsPage() {
  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolId] = useState('');
  const [classes, setClasses] = useState([]);

  useEffect(() => {
    loadRecords();
  }, []);

  const loadRecords = async () => {
    try {
      const schoolData = await fetchData('get_school_admin_data', { role: 'school_admin' });
      if (!schoolData.school_id) {
        setLoading(false);
        return;
      }
      setSchoolId(schoolData.school_id);

      const classesRes = await fetch(`/api/classes?school_id=${schoolData.school_id}`, {
        credentials: 'include',
      });
      const cj = await classesRes.json();
      setClasses(cj.classes || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center md:ml-56">
        <div className="animate-pulse text-primary-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen md:ml-56 pt-14 md:pt-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Attendance</h1>
      <p className="text-sm text-slate-500 mb-6">
        Daily, weekly, and monthly reports for students and staff. For gate sign-in/out, open the{' '}
        <strong>Staff</strong> tab on the daily report (student tab only shows pupils). Scans appear below (WAT).
      </p>

      <div className="card-elevated p-5 mb-6">
        <DetailedAttendanceReports
          schoolId={schoolId}
          classes={classes}
          defaultView="staff"
        />
      </div>

      <div className="card-elevated p-5">
        <AttendanceSignLog schoolId={schoolId} title="Today&apos;s gate scans" />
      </div>
    </div>
  );
}
