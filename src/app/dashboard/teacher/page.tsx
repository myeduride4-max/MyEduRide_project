// @ts-nocheck
'use client';

import { useEffect, useState, useMemo } from 'react';
import { fetchData } from '@/lib/api';
import StudentAvatar from '@/components/shared/StudentAvatar';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  Users, UserCheck, AlertTriangle, GraduationCap, Clock, Download,
  BookOpen, Car, CheckCircle2, ScanLine, Search,
} from 'lucide-react';
import TeacherScanModal from '@/components/teacher/TeacherScanModal';
import Link from 'next/link';
import { ATTENDANCE_UI_NOTE } from '@/lib/attendance/window';
import { formatTimeLagos } from '@/lib/timezone';
import { toast } from 'sonner';
export default function TeacherDashboard() {
  const [students, setStudents] = useState([]);
  const [stats, setStats] = useState({ present: 0, absent: 0, late: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolId] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [dismissAllBusy, setDismissAllBusy] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [readySearch, setReadySearch] = useState('');
  useEffect(() => {
    loadClass();
    const interval = setInterval(loadClass, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadClass = async () => {
    try {
      const data = await fetchData('get_teacher_dashboard_full');
      setSchoolId(data.school_id || '');
      setSchoolName(data.school?.name || '');
      setStudents(data.students || []);
      setStats({
        present: data.present_count || 0,
        absent: data.absent_count || 0,
        late: data.late_count || 0,
        total: (data.students || []).length,
      });
    } catch (err) {
      console.error(err);
      toast.error('Could not load class');
    }
    setLoading(false);
  };

  const activeStudents = useMemo(
    () => students.filter((s) => !s.ready_for_pickup && !s.in_extra_lesson),
    [students]
  );
  const readyStudents = useMemo(() => students.filter((s) => s.ready_for_pickup), [students]);
  const extraStudents = useMemo(() => students.filter((s) => s.in_extra_lesson), [students]);

  const filteredReadyStudents = useMemo(() => {
    const q = readySearch.trim().toLowerCase();
    if (!q) return readyStudents;
    return readyStudents.filter((s) =>
      `${s.first_name} ${s.last_name} ${s.student_id_number || ''}`.toLowerCase().includes(q)
    );
  }, [readyStudents, readySearch]);

  const markReady = async (studentId, studentName) => {
    setBusyId(studentId);
    try {
      if (!schoolId) {
        toast.error('School not loaded — refresh the page');
        return;
      }
      const res = await fetch('/api/teacher/ready-for-pickup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ student_id: studentId, school_id: schoolId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Already marked ready today');
        await loadClass();
        return;
      }
      toast.success(`${studentName} — ready for pickup`);
      await loadClass();
    } catch {
      toast.error('Failed to mark ready');
    }
    setBusyId(null);
  };

  const markExtraLesson = async (studentId, studentName) => {
    setBusyId(studentId);
    try {
      const res = await fetch('/api/teacher/extra-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ student_id: studentId, school_id: schoolId, action: 'add' }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${studentName} — extra lesson`);
      await loadClass();
    } catch {
      toast.error('Failed');
    }
    setBusyId(null);
  };

  const releaseExtraLesson = async (studentId, studentName) => {
    setBusyId(studentId);
    try {
      await fetch('/api/teacher/extra-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ student_id: studentId, school_id: schoolId, action: 'release' }),
      });
      toast.success(`${studentName} — extra lesson ended`);
      await loadClass();
    } catch {
      toast.error('Failed');
    }
    setBusyId(null);
  };

  const dismissAllReady = async () => {
    const eligible = activeStudents.filter((s) => s.present);
    if (eligible.length === 0) {
      toast.error('No present students to mark ready (extra lesson students are skipped)');
      return;
    }
    if (!confirm(`Mark ${eligible.length} present student(s) ready for pickup?`)) return;
    setDismissAllBusy(true);
    let ok = 0;
    for (const s of eligible) {
      try {
        const res = await fetch('/api/teacher/ready-for-pickup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ student_id: s.id, school_id: schoolId }),
        });
        if (res.ok) ok++;
      } catch { /* skip */ }
    }
    toast.success(`${ok} student(s) marked ready for pickup`);
    await loadClass();
    setDismissAllBusy(false);
  };

  const renderRow = (s, actions) => (
    <div key={s.id} className="list-row">
      <StudentAvatar photoUrl={s.photo_url} firstName={s.first_name} lastName={s.last_name} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900 truncate">{s.first_name} {s.last_name}</p>
        <p className="text-xs text-slate-500">{s.class?.name || 'No class'}</p>
        {s.present && (
          <p className="text-[10px] text-emerald-600 mt-0.5 flex items-center gap-1">
            <Clock size={10} />
            {s.late ? `Late · ${formatTimeLagos(s.arrival_time)}` : `Present · ${formatTimeLagos(s.arrival_time)}`}
          </p>
        )}
      </div>
      <span
        className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg shrink-0 ${
          s.present ? (s.late ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800') : 'bg-red-50 text-red-600'
        }`}
      >
        {s.present ? (s.late ? 'Late' : 'In') : 'Out'}
      </span>
      {actions}
    </div>
  );

  if (loading) {
    return (
      <div className="page-shell flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-primary-600 font-medium">Loading class...</div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="hero-banner">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
            <GraduationCap size={24} />
          </div>
          <div>
            <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Teacher</p>
            <h1 className="text-xl font-bold">{schoolName || 'My class'}</h1>
            <p className="text-white/80 text-sm">{stats.total} students · {readyStudents.length} ready for pickup</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="dash-stat">
          <div><p className="text-[11px] font-medium text-slate-500 uppercase">Total</p><p className="text-2xl font-bold">{stats.total}</p></div>
          <Users size={20} className="text-primary-600" />
        </div>
        <div className="dash-stat">
          <div><p className="text-[11px] font-medium text-slate-500 uppercase">Present</p><p className="text-2xl font-bold text-emerald-600">{stats.present}</p></div>
          <UserCheck size={20} className="text-emerald-500" />
        </div>
        <div className="dash-stat">
          <div><p className="text-[11px] font-medium text-slate-500 uppercase">Absent</p><p className="text-2xl font-bold text-red-500">{stats.absent}</p></div>
          <AlertTriangle size={20} className="text-red-400" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={dismissAllReady}
          disabled={dismissAllBusy}
          className="btn-primary text-sm flex items-center gap-2"
        >
          <Car size={16} />
          {dismissAllBusy ? 'Marking…' : 'Dismiss all (ready only)'}
        </button>
        <button
          type="button"
          onClick={() => setShowScan(true)}
          className="btn-secondary text-sm flex items-center gap-2"
        >
          <ScanLine size={16} /> Scan ID (mark present)
        </button>
        <Link href="/dashboard/teacher/reports" className="btn-secondary text-sm flex items-center gap-2">
          <Download size={16} /> Reports
        </Link>
      </div>

      {showScan && (
        <TeacherScanModal
          schoolId={schoolId}
          onClose={() => setShowScan(false)}
          onSuccess={loadClass}
        />
      )}

      <PageHeader title="Active students" subtitle="Gate marks present — you mark Ready for Pickup or Extra Lesson (once per day)" />
      <p className="text-xs text-slate-500 mb-3">{ATTENDANCE_UI_NOTE}</p>

      <div className="card-elevated divide-y divide-slate-100 mb-6">
        {activeStudents.map((s) =>
          renderRow(s, (
            <div className="flex flex-col gap-1 shrink-0">
              <button
                type="button"
                onClick={() => markReady(s.id, `${s.first_name} ${s.last_name}`)}
                disabled={busyId === s.id}
                className="text-xs px-3 py-2 rounded-xl bg-orange-500 text-white font-semibold disabled:opacity-50"
              >
                {busyId === s.id ? '…' : 'Ready for Pickup'}
              </button>
              <button
                type="button"
                onClick={() => markExtraLesson(s.id, `${s.first_name} ${s.last_name}`)}
                disabled={busyId === s.id}
                className="text-[10px] px-2 py-1.5 rounded-lg border border-violet-200 text-violet-700 font-semibold flex items-center gap-1"
              >
                <BookOpen size={10} /> Extra lesson
              </button>
            </div>
          ))
        )}
        {activeStudents.length === 0 && (
          <p className="py-8 text-center text-slate-400 text-sm">No active students — all ready or in extra lesson</p>
        )}
      </div>

      {extraStudents.length > 0 && (
        <>
          <PageHeader title="Extra lesson" subtitle="Not ready for pickup until you release them" />
          <div className="card-elevated divide-y mb-6">
            {extraStudents.map((s) =>
              renderRow(s, (
                <button
                  type="button"
                  onClick={() => releaseExtraLesson(s.id, `${s.first_name} ${s.last_name}`)}
                  disabled={busyId === s.id}
                  className="text-xs px-3 py-2 rounded-xl bg-violet-600 text-white font-semibold shrink-0"
                >
                  End extra lesson
                </button>
              ))
            )}
          </div>
        </>
      )}

      {readyStudents.length > 0 && (
        <>
          <PageHeader title="Ready for pickup" subtitle="Sent to gate — cannot mark again today" />
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="search"
              value={readySearch}
              onChange={(e) => setReadySearch(e.target.value)}
              placeholder="Search ready students…"
              className="input pl-9 min-h-[44px]"
            />
          </div>
          <div className="card-elevated divide-y">
            {filteredReadyStudents.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">No matches for your search</p>
            ) : (
              filteredReadyStudents.map((s) =>
                renderRow(s, (
                  <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1 shrink-0">
                    <CheckCircle2 size={14} /> Ready
                  </span>
                ))
              )
            )}
          </div>
        </>
      )}

    </div>
  );
}
