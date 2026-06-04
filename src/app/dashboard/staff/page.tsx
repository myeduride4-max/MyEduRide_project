// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { fetchData, logout } from '@/lib/api';
import DetailedAttendanceReports from '@/components/attendance/DetailedAttendanceReports';
import { LogOut, ClipboardList } from 'lucide-react';
export default function StaffDashboardPage() {
  const [schoolId, setSchoolId] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchData('get_staff_dashboard');
        setSchoolId(data.school_id || '');
        setJobTitle(data.job_title || 'Staff');
      } catch {
        /* ignore */
      }
      setLoading(false);
    })();
  }, []);

  const handleLogout = () => {
    logout();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-primary-600">Loading…</div>
      </div>
    );
  }

  return (
    <div className="page-shell max-w-lg mx-auto pt-14 pb-10">
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My attendance</h1>
          <p className="text-sm text-slate-500 mt-0.5 capitalize">{jobTitle}</p>
          <p className="text-xs text-slate-400 mt-1">
            Sign in and out at the gate with your staff ID card. Only you can see your records here.
          </p>
        </div>
        <button type="button" onClick={handleLogout} className="btn-secondary p-2" aria-label="Log out">
          <LogOut size={18} />
        </button>
      </div>

      <div className="card-elevated p-5 mb-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-700">
          <ClipboardList size={20} />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">Your sign-in history</p>
          <p className="text-xs text-slate-500">Daily, weekly, and monthly — your scans only</p>
        </div>
      </div>

      <div className="card-elevated p-5">
        <DetailedAttendanceReports
          schoolId={schoolId}
          title="Attendance"
          showStudentReports={false}
          showStaffTab={true}
          defaultView="staff"
          staffTabLabel="My records"
        />
      </div>
    </div>
  );
}
