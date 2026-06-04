// @ts-nocheck
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { formatTimeLagos, todayInLagos } from '@/lib/timezone';

const STATUS_LABELS = {
  present: 'Present',
  on_time: 'Present',
  late: 'Late',
  absent: 'Absent',
  dismissed: 'Dismissed',
};

const DAY_CELL = {
  on_time: 'P',
  present: 'P',
  late: 'L',
  absent: 'A',
  excluded: '—',
  weekend: '·',
};

export default function DetailedAttendanceReports({
  schoolId,
  classFilter = null,
  classes = [],
  title = 'Attendance reports',
  showStudentReports = true,
  showStaffTab = true,
  staffTabLabel = 'Staff',
  defaultView = 'students',
}) {
  const [reportType, setReportType] = useState('daily');
  const [date, setDate] = useState(todayInLagos());
  const [month, setMonth] = useState(todayInLagos().slice(0, 7));
  const [classId, setClassId] = useState(classFilter || '');
  const [monthView, setMonthView] = useState(defaultView === 'staff' ? 'staff' : 'students');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const loadReport = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        school_id: schoolId,
        type: reportType,
      });
      if (reportType === 'monthly') {
        params.set('month', month);
      } else {
        params.set('date', date);
      }
      if (classId) params.set('class_id', classId);
      const res = await fetch(`/api/attendance/reports?${params}`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load report');
      if (
        json.message &&
        !json.report?.length &&
        !json.student_monthly?.length &&
        !json.daily_summaries?.some((d) => d.present > 0 || d.late > 0)
      ) {
        toast.info(json.message);
      }
      setData(json);
    } catch (e) {
      toast.error(e.message || 'Could not load report');
      setData(null);
    }
    setLoading(false);
  }, [schoolId, reportType, date, month, classId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  useEffect(() => {
    if (!showStudentReports) setMonthView('staff');
  }, [showStudentReports]);

  const exportCsv = async () => {
    if (!schoolId) return;
    try {
      const params = new URLSearchParams({
        school_id: schoolId,
        type: reportType,
        format: 'csv',
      });
      if (reportType === 'monthly') params.set('month', month);
      else params.set('date', date);
      if (classId) params.set('class_id', classId);
      const res = await fetch(`/api/attendance/reports?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disp = res.headers.get('Content-Disposition');
      const match = disp?.match(/filename="(.+)"/);
      a.download = match?.[1] || `attendance_${reportType}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV downloaded');
    } catch {
      toast.error('CSV export failed');
    }
  };

  const printPdf = () => {
    window.print();
  };

  return (
    <div className="space-y-4 print-area">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <div className="flex gap-2">
          <button type="button" onClick={exportCsv} className="btn-secondary text-sm flex items-center gap-1.5 py-2">
            <Download size={16} /> CSV
          </button>
          {reportType !== 'daily' && (
            <button type="button" onClick={printPdf} className="btn-secondary text-sm flex items-center gap-1.5 py-2">
              <Download size={16} /> Print / PDF
            </button>
          )}
        </div>
      </div>

      <div className="pill-tabs">
        {['daily', 'weekly', 'monthly'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setReportType(t)}
            className={reportType === t ? 'pill-tab-active' : 'pill-tab-inactive'}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">
            {reportType === 'daily' ? 'Date' : reportType === 'weekly' ? 'Week containing' : 'Month'}
          </label>
          {reportType === 'monthly' ? (
            <input
              type="month"
              className="input"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          ) : (
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          )}
        </div>
        {!classFilter && classes.length > 0 && (
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Class</label>
            <select className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {showStudentReports &&
        reportType === 'daily' &&
        data?.type === 'daily' &&
        !data?.excluded &&
        showStaffTab &&
        data.staff_report != null && (
        <div className="pill-tabs">
          <button
            type="button"
            onClick={() => setMonthView('students')}
            className={monthView === 'students' ? 'pill-tab-active' : 'pill-tab-inactive'}
          >
            Students
          </button>
          <button
            type="button"
            onClick={() => setMonthView('staff')}
            className={monthView === 'staff' ? 'pill-tab-active' : 'pill-tab-inactive'}
          >
            {staffTabLabel}
          </button>
        </div>
      )}

      {showStudentReports &&
        (reportType === 'monthly' || reportType === 'weekly') &&
        data &&
        (data.type === 'monthly' || data.type === 'weekly') &&
        showStaffTab && (
        <div className="pill-tabs">
          <button
            type="button"
            onClick={() => setMonthView('students')}
            className={monthView === 'students' ? 'pill-tab-active' : 'pill-tab-inactive'}
          >
            Students
          </button>
          <button
            type="button"
            onClick={() => setMonthView('staff')}
            className={monthView === 'staff' ? 'pill-tab-active' : 'pill-tab-inactive'}
          >
            {staffTabLabel}
          </button>
        </div>
      )}

      {loading && <p className="text-sm text-slate-500 animate-pulse">Loading report…</p>}

      {!loading && data?.excluded && data?.type === 'daily' && (
        <div className="card p-4 bg-slate-50 border border-slate-200">
          <p className="font-semibold text-slate-800">Non-school day</p>
          <p className="text-sm text-slate-600 mt-1">
            {data.excluded_title || 'No attendance expected'} — not counted in reports.
          </p>
        </div>
      )}

      {!loading && data?.message && !data?.report?.length && data?.type !== 'daily' && (
        <div className="card p-4 text-sm text-slate-600">{data.message}</div>
      )}

      {!loading &&
        data?.type === 'daily' &&
        !data?.excluded &&
        monthView === 'staff' &&
        showStaffTab && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['Staff', data.staff_summary?.total],
              ['On time', data.staff_summary?.present],
              ...(data.type === 'daily' ? [['Late', data.staff_summary?.late]] : []),
              ['Absent', data.staff_summary?.absent],
            ].map(([label, val]) => (
              <div key={label} className="card text-center py-3">
                <p className="text-xl font-bold">{val ?? 0}</p>
                <p className="text-[10px] text-slate-500 uppercase">{label}</p>
              </div>
            ))}
          </div>
          <div className="card-elevated overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 text-xs text-slate-500">Staff</th>
                  <th className="text-left px-3 py-2 text-xs text-slate-500">Role</th>
                  <th className="text-left px-3 py-2 text-xs text-slate-500">Status</th>
                  <th className="text-left px-3 py-2 text-xs text-slate-500">Sign in</th>
                  <th className="text-left px-3 py-2 text-xs text-slate-500">Sign out</th>
                  {data.type === 'daily' && (
                    <th className="text-left px-3 py-2 text-xs text-slate-500">Late (min)</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data.staff_report || []).map((r) => (
                  <tr key={r.user_id}>
                    <td className="px-3 py-2 font-medium">{r.full_name}</td>
                    <td className="px-3 py-2 text-slate-600 capitalize">{r.role}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${
                          r.status === 'absent'
                            ? 'bg-red-50 text-red-700'
                            : r.status === 'late'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-emerald-50 text-emerald-800'
                        }`}
                      >
                        {STATUS_LABELS[r.status] || r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatTimeLagos(r.clock_in_time)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatTimeLagos(r.clock_out_time)}</td>
                    {data.type === 'daily' && (
                      <td className="px-3 py-2">{r.minutes_late ?? '—'}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-400">
            Staff present = ID card sign-in at gate or admin scan. Sign-out time shown when recorded.
          </p>
        </>
      )}

      {!loading && showStudentReports && data?.type === 'daily' && !data?.excluded && monthView === 'students' && (
        <>
          <div className="grid grid-cols-4 gap-2">
            {[
              ['Total', data.summary?.total],
              ['Present', data.summary?.present],
              ['Late', data.summary?.late],
              ['Absent', data.summary?.absent],
            ].map(([label, val]) => (
              <div key={label} className="card text-center py-3">
                <p className="text-xl font-bold">{val ?? 0}</p>
                <p className="text-[10px] text-slate-500 uppercase">{label}</p>
              </div>
            ))}
          </div>
          <div className="card-elevated overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 text-xs text-slate-500">Student</th>
                  <th className="text-left px-3 py-2 text-xs text-slate-500">Class</th>
                  <th className="text-left px-3 py-2 text-xs text-slate-500">Status</th>
                  <th className="text-left px-3 py-2 text-xs text-slate-500">Check-in</th>
                  <th className="text-left px-3 py-2 text-xs text-slate-500">Check-out</th>
                  <th className="text-left px-3 py-2 text-xs text-slate-500">Late (min)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data.report || []).map((r) => (
                  <tr key={r.student_id}>
                    <td className="px-3 py-2 font-medium">{r.first_name} {r.last_name}</td>
                    <td className="px-3 py-2 text-slate-600">{r.class_name}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${
                        r.status === 'absent' ? 'bg-red-50 text-red-700' :
                        r.status === 'late' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'
                      }`}>
                        {STATUS_LABELS[r.status] || r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatTimeLagos(r.check_in_time)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatTimeLagos(r.check_out_time)}</td>
                    <td className="px-3 py-2">{r.minutes_late ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && showStudentReports && data && data.type !== 'daily' && data.type !== 'monthly' && (
        <>
          <div className="card p-4 flex items-center gap-3">
            <BarChart3 className="text-primary-600" size={28} />
            <div>
              <p className="text-2xl font-bold">{data.summary?.attendance_pct ?? 0}%</p>
              <p className="text-xs text-slate-500">
                {data.summary?.grand_present} present · {data.summary?.grand_late} late · {data.summary?.grand_absent} absent
                {' '}over {data.summary?.school_days ?? data.summary?.total_days} school days
              </p>
            </div>
          </div>
          <h3 className="text-sm font-semibold text-slate-700">By class</h3>
          <div className="grid gap-2">
            {(data.class_breakdown || []).map((c) => (
              <div key={c.class_id} className="card-elevated p-3 flex justify-between items-center">
                <div>
                  <p className="font-semibold">{c.class_name}</p>
                  <p className="text-xs text-slate-500">{c.student_count} students</p>
                </div>
                <p className="text-lg font-bold text-primary-700">{c.attendance_pct}%</p>
              </div>
            ))}
          </div>
          <h3 className="text-sm font-semibold text-slate-700 mt-4">Daily breakdown</h3>
          <div className="card-elevated divide-y max-h-64 overflow-y-auto">
            {(data.daily_summaries || []).map((d) => (
              <div key={d.date} className="flex justify-between px-3 py-2 text-sm">
                <span>{d.date}</span>
                <span className="text-emerald-600">{d.present} in</span>
                <span className="text-amber-600">{d.late} late</span>
                <span className="text-red-500">{d.absent} out</span>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading &&
        showStudentReports &&
        (data?.type === 'monthly' || data?.type === 'weekly') &&
        monthView === 'students' &&
        data.student_monthly?.length > 0 && (
        <>
          <div className="card p-4">
            <p className="text-lg font-bold">
              {data.type === 'weekly' ? 'Weekly' : data.month}
            </p>
            <p className="text-xs text-slate-500">
              {data.range?.start_date} → {data.range?.end_date} ·{' '}
              {data.summary?.school_days} school days · {data.summary?.total_students} students
            </p>
          </div>
          <div className="card-elevated overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-2 py-2 text-xs sticky left-0 bg-slate-50 z-10">Student</th>
                  <th className="text-left px-2 py-2 text-xs">Class</th>
                  {(data.student_monthly?.[0]?.days || []).map((d) => (
                    <th key={d.date} className="px-0.5 py-1 text-[9px] text-slate-500 font-normal w-6">
                      {d.date.slice(8)}
                    </th>
                  ))}
                  <th className="px-1 py-2 text-xs text-emerald-700">P</th>
                  <th className="px-1 py-2 text-xs text-amber-700">L</th>
                  <th className="px-1 py-2 text-xs text-red-600">A</th>
                  <th className="px-1 py-2 text-xs">%</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data.student_monthly || []).map((r) => (
                  <tr key={r.student_id}>
                    <td className="px-2 py-2 font-medium sticky left-0 bg-white z-10 text-xs">{r.first_name} {r.last_name}</td>
                    <td className="px-2 py-2 text-slate-600 text-xs">{r.class_name}</td>
                    {(r.days || []).map((d) => (
                      <td key={d.date} className="px-0.5 py-1 text-center">
                        <span
                          title={`${d.date}: ${d.label || d.status}`}
                          className={`inline-flex w-5 h-5 items-center justify-center rounded text-[8px] font-bold ${
                            d.status === 'weekend' || d.status === 'excluded' ? 'bg-slate-100 text-slate-400' :
                            d.status === 'late' ? 'bg-amber-400 text-white' :
                            d.status === 'on_time' ? 'bg-emerald-500 text-white' :
                            'bg-red-400 text-white'
                          }`}
                        >
                          {DAY_CELL[d.status] || (d.status === 'weekend' ? '·' : 'A')}
                        </span>
                      </td>
                    ))}
                    <td className="px-2 py-2 text-center text-emerald-700 text-xs">{r.present}</td>
                    <td className="px-2 py-2 text-center text-amber-700 text-xs">{r.late}</td>
                    <td className="px-2 py-2 text-center text-red-600 text-xs">{r.absent}</td>
                    <td className="px-2 py-2 text-center font-semibold text-xs">{r.attendance_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-400">
            P = on time · L = late · A = absent · — = holiday/event · grey dot = weekend · totals exclude non-school days
          </p>
        </>
      )}

      {!loading &&
        (data?.type === 'monthly' || data?.type === 'weekly') &&
        monthView === 'staff' &&
        data.staff_report?.length > 0 && (
        <>
          <div className="card p-4">
            <p className="text-lg font-bold">
              Staff — {data.type === 'weekly' ? 'this week' : data.month}
            </p>
            <p className="text-xs text-slate-500">
              Staff ID card scans only (gate or admin) · {data.summary?.total_staff} staff
            </p>
          </div>
          <div className="card-elevated overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-2 py-2 text-xs sticky left-0 bg-slate-50 z-10">Name</th>
                  <th className="text-left px-2 py-2 text-xs">Role</th>
                  {(data.staff_report?.[0]?.days || []).map((d) => (
                    <th key={d.date} className="px-0.5 py-1 text-[9px] text-slate-500 font-normal w-6">
                      {d.date.slice(8)}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-xs text-center">Days in</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data.staff_report || []).map((r) => (
                  <tr key={r.user_id}>
                    <td className="px-2 py-2 font-medium sticky left-0 bg-white z-10 text-xs">{r.full_name}</td>
                    <td className="px-2 py-2 text-slate-600 capitalize text-xs">{r.role}</td>
                    {(r.days || []).map((d) => (
                      <td key={d.date} className="px-0.5 py-1 text-center">
                        <span
                          title={`${d.date}`}
                          className={`inline-flex w-5 h-5 items-center justify-center rounded text-[8px] font-bold ${
                            d.status === 'weekend' || d.status === 'excluded' ? 'bg-slate-100 text-slate-400' :
                            d.status === 'late' ? 'bg-amber-500 text-white' :
                            d.status === 'present' ? 'bg-emerald-500 text-white' : 'bg-red-400 text-white'
                          }`}
                        >
                          {DAY_CELL[d.status] || (d.status === 'weekend' || d.status === 'excluded' ? '·' : '—')}
                        </span>
                      </td>
                    ))}
                    <td className="px-2 py-2 text-center font-semibold text-xs">{r.days_present}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-xs text-slate-400">
        Times in West Africa Time (Lagos). Weekly and monthly totals count weekdays only — weekends are never school days.
      </p>
    </div>
  );
}
