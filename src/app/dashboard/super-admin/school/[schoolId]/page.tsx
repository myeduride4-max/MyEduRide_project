// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Users, GraduationCap, UserCheck, ArrowLeft, School } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import StudentAvatar from '@/components/shared/StudentAvatar';

export default function SchoolDetailPage() {
  const params = useParams();
  const schoolId = params.schoolId;
  const [school, setSchool] = useState(null);
  const [students, setStudents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [classes, setClasses] = useState([]);
  const [stats, setStats] = useState({ total_students: 0, present_today: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('students');
  const [error, setError] = useState('');

  useEffect(() => { loadSchool(); }, [schoolId]);

  const loadSchool = async () => {
    setError('');
    try {
      const schoolRes = await fetch('/api/schools/list', { cache: 'no-store', credentials: 'include' });
      const schoolData = await schoolRes.json();
      setSchool(schoolData.schools?.find((s) => s.id === schoolId) || null);

      const statsRes = await fetch('/api/data', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_school_dashboard', params: { school_id: schoolId } }),
      });
      if (statsRes.ok) setStats(await statsRes.json());

      const studentsRes = await fetch(`/api/schools/students?school_id=${schoolId}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      const studentsData = await studentsRes.json();
      if (!studentsRes.ok) {
        setError(studentsData.error || 'Could not load students');
        toast.error(studentsData.error || 'Could not load students');
      } else {
        setStudents(studentsData.students || []);
      }

      const staffRes = await fetch(`/api/schools/staff?school_id=${schoolId}&ensure_profiles=1`, {
        cache: 'no-store',
        credentials: 'include',
      });
      const staffData = await staffRes.json();
      if (staffRes.ok) setStaff(staffData.staff || []);
      else toast.error(staffData.error || 'Could not load staff');

      const classRes = await fetch('/api/data', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_classes', params: { school_id: schoolId } }),
      });
      if (classRes.ok) setClasses((await classRes.json()).classes || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load school data');
    }
    setLoading(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-primary-600">Loading...</div></div>;

  return (
    <div className="p-6 min-h-screen">
      <Link href="/dashboard/super-admin" className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4"><ArrowLeft size={16} /> Back</Link>
      <h1 className="text-2xl font-bold">{school?.name || 'School'}</h1>
      <p className="text-sm text-gray-500 mb-6">{school?.address || ''}</p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="stat-card"><div><p className="text-xs text-gray-500">Students</p><p className="text-xl font-bold">{students.length}</p></div><Users size={18} className="text-primary-600" /></div>
        <div className="stat-card"><div><p className="text-xs text-gray-500">Staff</p><p className="text-xl font-bold">{staff.length}</p></div><GraduationCap size={18} className="text-blue-600" /></div>
        <div className="stat-card"><div><p className="text-xs text-gray-500">Classes</p><p className="text-xl font-bold">{classes.length}</p></div><School size={18} className="text-purple-600" /></div>
        <div className="stat-card"><div><p className="text-xs text-gray-500">Present Today</p><p className="text-xl font-bold text-green-600">{stats.present_today || 0}</p></div><UserCheck size={18} className="text-green-600" /></div>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-4">
        {['students', 'staff', 'classes'].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize ${tab === t ? 'bg-white shadow-sm' : 'text-gray-500'}`}>{t}</button>
        ))}
      </div>

      {tab === 'students' && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b"><span className="text-sm font-semibold">Students ({students.length})</span></div>
          <div className="divide-y max-h-[60vh] overflow-y-auto">
            {students.map((s) => (
              <div key={s.id} className="px-4 py-3 flex items-center gap-3">
                <StudentAvatar
                  photoUrl={s.photo_url}
                  firstName={s.first_name}
                  lastName={s.last_name}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{s.first_name} {s.last_name}</p>
                  <p className="text-xs text-gray-400 font-mono">{s.student_id_number}</p>
                  <p className="text-xs text-gray-500">{s.class?.name || 'No class'}</p>
                </div>
              </div>
            ))}
            {students.length === 0 && <div className="py-8 text-center text-gray-400">No students enrolled yet</div>}
          </div>
        </div>
      )}

      {tab === 'staff' && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b"><span className="text-sm font-semibold">Staff ({staff.length})</span></div>
          <div className="divide-y">
            {staff.map((s) => (
              <div key={s.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">{s.profile?.full_name?.[0] || '?'}</div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{s.profile?.full_name}</p>
                  <p className="text-xs text-gray-400">{s.profile?.email}</p>
                  {s.staff?.staff_id_number && <p className="text-xs font-mono text-gray-500">{s.staff.staff_id_number}</p>}
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 capitalize">{s.role.replace('_', ' ')}</span>
              </div>
            ))}
            {staff.length === 0 && <div className="py-8 text-center text-gray-400">No staff</div>}
          </div>
        </div>
      )}

      {tab === 'classes' && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b"><span className="text-sm font-semibold">Classes ({classes.length})</span></div>
          <div className="divide-y">
            {classes.map((c) => (
              <div key={c.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-xs font-bold">{c.name?.[0]}</div>
                <div className="flex-1"><p className="text-sm font-medium">{c.name}</p><p className="text-xs text-gray-400">{c.grade}</p></div>
              </div>
            ))}
            {classes.length === 0 && <div className="py-8 text-center text-gray-400">No classes</div>}
          </div>
        </div>
      )}
    </div>
  );
}
