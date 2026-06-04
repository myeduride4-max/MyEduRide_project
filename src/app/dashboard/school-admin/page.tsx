// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { fetchData, getSession } from '@/lib/api';
import { Users, GraduationCap, UserCheck, TrendingUp, Plus, Bell, School, Search } from 'lucide-react';
import Link from 'next/link';
import StudentAvatar from '@/components/shared/StudentAvatar';
import PickupRequestsPanel from '@/components/admin/PickupRequestsPanel';
import ReadyForPickupPanel from '@/components/admin/ReadyForPickupPanel';
import { formatTimeLagos } from '@/lib/timezone';

export default function SchoolAdminDashboard() {
  const [stats, setStats] = useState({
    total_students: 0, present_today: 0, absent_today: 0,
    late_today: 0, total_teachers: 0, total_parents: 0,
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [schoolName, setSchoolName] = useState('');
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolId] = useState('');
  const [activitySearch, setActivitySearch] = useState('');

  useEffect(() => {
    const session = getSession();
    if (session) {
      setUserName(session.full_name || '');
      if (session.primary_school?.name) {
        setSchoolName(session.primary_school.name);
      }
    }
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const schoolData = await fetchData('get_school_admin_data', { role: 'school_admin' });
      if (!schoolData.school) { setLoading(false); return; }
      setSchoolId(schoolData.school_id);
      setSchoolName(schoolData.school.name);
      const dashboard = await fetchData('get_school_dashboard', { school_id: schoolData.school_id });
      setStats(dashboard);
      setRecentActivity(dashboard.recent_activity || []);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-primary-600 font-medium">Loading dashboard...</div></div>;
  }

  const filteredActivity = recentActivity.filter((record) => {
    const q = activitySearch.toLowerCase();
    if (!q) return true;
    const name = `${record.student?.first_name || ''} ${record.student?.last_name || ''}`;
    return `${name} ${record.type || ''}`.toLowerCase().includes(q);
  });

  return (
    <div className="page-shell max-w-6xl">
      <div className="hero-banner mb-6">
        <p className="text-white/80 text-sm font-medium">Welcome to</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-white mt-0.5">{schoolName || 'Your school'}</h1>
        {userName && <p className="text-white/70 text-sm mt-2">Signed in as {userName}</p>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Today at a glance</h2>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2.5 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all">
            <Bell size={18} className="text-gray-500" />
          </button>
          <div className="flex items-center gap-2.5 pl-3 pr-4 py-2 rounded-xl bg-white border border-gray-100 shadow-sm">
            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-xs font-bold">
              {userName.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div>
              <p className="text-xs font-medium text-gray-800">{userName}</p>
              <p className="text-[10px] text-gray-400">Admin</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <div className="dash-stat">
          <div>
            <p className="text-sm text-gray-500 mb-1">Students</p>
            <p className="text-3xl sm:text-4xl font-bold text-gray-900">{formatNumber(stats.total_students)}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center">
            <Users size={20} className="text-purple-600" />
          </div>
        </div>
        <div className="dash-stat">
          <div>
            <p className="text-sm text-gray-500 mb-1">Teachers</p>
            <p className="text-3xl sm:text-4xl font-bold text-gray-900">{formatNumber(stats.total_teachers)}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center">
            <GraduationCap size={20} className="text-blue-600" />
          </div>
        </div>
        <div className="dash-stat">
          <div>
            <p className="text-sm text-gray-500 mb-1">Parents</p>
            <p className="text-3xl sm:text-4xl font-bold text-gray-900">{formatNumber(stats.total_parents)}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-orange-100 flex items-center justify-center">
            <UserCheck size={20} className="text-orange-600" />
          </div>
        </div>
        <div className="dash-stat">
          <div>
            <p className="text-sm text-gray-500 mb-1">Present today</p>
            <p className="text-3xl sm:text-4xl font-bold text-gray-900">{formatNumber(stats.present_today)}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-green-100 flex items-center justify-center">
            <TrendingUp size={20} className="text-green-600" />
          </div>
        </div>
      </div>

      {/* Second row - Pie Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <div className="card">
          <h3 className="text-sm font-semibold mb-4">Today's Attendance</h3>
          <div className="flex items-center justify-center">
            <div className="relative w-40 h-40">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                {(() => {
                  const total = stats.present_today + stats.late_today + stats.absent_today || 1;
                  const onTimePercent = (stats.present_today / total) * 100;
                  const latePercent = (stats.late_today / total) * 100;
                  const absentPercent = (stats.absent_today / total) * 100;
                  const radius = 40;
                  const circumference = 2 * Math.PI * radius;
                  const onTimeOffset = 0;
                  const lateOffset = onTimePercent;
                  const absentOffset = onTimePercent + latePercent;
                  return (
                    <>
                      <circle cx="50" cy="50" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="12" />
                      {stats.present_today > 0 && <circle cx="50" cy="50" r={radius} fill="none" stroke="#10b981" strokeWidth="12" strokeDasharray={`${(onTimePercent / 100) * circumference} ${circumference}`} strokeDashoffset={`-${(onTimeOffset / 100) * circumference}`} />}
                      {stats.late_today > 0 && <circle cx="50" cy="50" r={radius} fill="none" stroke="#f59e0b" strokeWidth="12" strokeDasharray={`${(latePercent / 100) * circumference} ${circumference}`} strokeDashoffset={`-${(lateOffset / 100) * circumference}`} />}
                      {stats.absent_today > 0 && <circle cx="50" cy="50" r={radius} fill="none" stroke="#ef4444" strokeWidth="12" strokeDasharray={`${(absentPercent / 100) * circumference} ${circumference}`} strokeDashoffset={`-${(absentOffset / 100) * circumference}`} />}
                    </>
                  );
                })()}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-2xl font-bold">{stats.total_students}</p>
                <p className="text-[10px] text-gray-500">Total</p>
              </div>
            </div>
          </div>
          <div className="flex justify-center gap-4 mt-4">
            <span className="flex items-center gap-1.5 text-xs"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> On Time ({stats.present_today})</span>
            <span className="flex items-center gap-1.5 text-xs"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Late ({stats.late_today})</span>
            <span className="flex items-center gap-1.5 text-xs"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Absent ({stats.absent_today})</span>
          </div>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold mb-4">School Overview</h3>
          <div className="flex items-center justify-center">
            <div className="relative w-40 h-40">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                {(() => {
                  const total = stats.total_students + stats.total_teachers + stats.total_parents || 1;
                  const studentsPercent = (stats.total_students / total) * 100;
                  const teachersPercent = (stats.total_teachers / total) * 100;
                  const parentsPercent = (stats.total_parents / total) * 100;
                  const radius = 40;
                  const circumference = 2 * Math.PI * radius;
                  return (
                    <>
                      <circle cx="50" cy="50" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="12" />
                      {stats.total_students > 0 && <circle cx="50" cy="50" r={radius} fill="none" stroke="#8b5cf6" strokeWidth="12" strokeDasharray={`${(studentsPercent / 100) * circumference} ${circumference}`} strokeDashoffset="0" />}
                      {stats.total_teachers > 0 && <circle cx="50" cy="50" r={radius} fill="none" stroke="#3b82f6" strokeWidth="12" strokeDasharray={`${(teachersPercent / 100) * circumference} ${circumference}`} strokeDashoffset={`-${(studentsPercent / 100) * circumference}`} />}
                      {stats.total_parents > 0 && <circle cx="50" cy="50" r={radius} fill="none" stroke="#f97316" strokeWidth="12" strokeDasharray={`${(parentsPercent / 100) * circumference} ${circumference}`} strokeDashoffset={`-${((studentsPercent + teachersPercent) / 100) * circumference}`} />}
                    </>
                  );
                })()}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-2xl font-bold">{stats.total_students + stats.total_teachers + stats.total_parents}</p>
                <p className="text-[10px] text-gray-500">Total</p>
              </div>
            </div>
          </div>
          <div className="flex justify-center gap-4 mt-4">
            <span className="flex items-center gap-1.5 text-xs"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Students ({stats.total_students})</span>
            <span className="flex items-center gap-1.5 text-xs"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Teachers ({stats.total_teachers})</span>
            <span className="flex items-center gap-1.5 text-xs"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> Parents ({stats.total_parents})</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <ReadyForPickupPanel schoolId={schoolId} />
        <PickupRequestsPanel schoolId={schoolId} />
      </div>

      {/* Quick Actions + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Quick Actions */}
        <div className="card">
          <h3 className="font-semibold text-sm mb-4">Quick Actions</h3>
          <div className="space-y-2">
            <Link href="/dashboard/school-admin/students/new" className="flex items-center gap-3 p-3 rounded-xl hover:bg-primary-50 transition-all group">
              <div className="w-9 h-9 rounded-lg bg-primary-100 flex items-center justify-center group-hover:bg-primary-200 transition-all">
                <Plus size={16} className="text-primary-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">Add Student</span>
            </Link>
            <Link href="/dashboard/school-admin/staff/new" className="flex items-center gap-3 p-3 rounded-xl hover:bg-blue-50 transition-all group">
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-all">
                <GraduationCap size={16} className="text-blue-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">Add Staff</span>
            </Link>
            <Link href="/dashboard/school-admin/parents" className="flex items-center gap-3 p-3 rounded-xl hover:bg-orange-50 transition-all group">
              <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center group-hover:bg-orange-200 transition-all">
                <UserCheck size={16} className="text-orange-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">View parents</span>
            </Link>
            <Link href="/dashboard/school-admin/setup" className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-all group">
              <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-slate-200 transition-all">
                <School size={16} className="text-slate-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">School Setup</span>
            </Link>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">Recent Gate Activity</h3>
            <Link href="/dashboard/school-admin/reports/gate-activities" className="text-xs text-primary-600 hover:underline min-h-[44px] inline-flex items-center">View all</Link>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="search"
              value={activitySearch}
              onChange={(e) => setActivitySearch(e.target.value)}
              placeholder="Search activity…"
              className="input pl-9 text-sm min-h-[44px]"
            />
          </div>
          <div className="space-y-3">
            {filteredActivity.slice(0, 8).map((record: any) => (
              <div key={record.id} className="flex items-center gap-3">
                <StudentAvatar
                  photoUrl={record.student?.photo_url}
                  firstName={record.student?.first_name}
                  lastName={record.student?.last_name}
                  size="sm"
                  accentColor="#64748b"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{record.student?.first_name} {record.student?.last_name}</p>
                  <p className="text-xs text-gray-400">{record.type === 'arrival' ? 'Arrived' : 'Left'}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">{formatTimeLagos(record.timestamp)}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    record.status === 'on_time' ? 'bg-green-50 text-green-700' : record.status === 'late' ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-500'
                  }`}>{record.status === 'on_time' ? 'On Time' : record.status === 'late' ? 'Late' : ''}</span>
                </div>
              </div>
            ))}
            {filteredActivity.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">
                {recentActivity.length === 0 ? 'No gate activity yet' : 'No matches for your search'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 1 : 2) + 'K';
  return n.toString();
}
