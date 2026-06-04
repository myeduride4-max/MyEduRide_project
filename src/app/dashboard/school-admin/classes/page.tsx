// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { fetchData } from '@/lib/api';
import { Plus, Users, Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

export default function ClassesPage() {
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', arm: '', assigned_teacher_id: '' });
  const ARM_OPTIONS = ['A', 'B', 'C'];
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const schoolData = await fetchData('get_school_admin_data', { role: 'school_admin' });
      if (!schoolData?.school_id) {
        toast.error(schoolData?.error || 'No school linked to your admin account');
        setLoading(false);
        return;
      }
      setSchoolId(schoolData.school_id);

      const classesData = await fetchData('get_classes', { school_id: schoolData.school_id });
      if (classesData.error && !classesData.classes?.length) {
        throw new Error(classesData.error);
      }
      setClasses(classesData.classes || []);

      try {
        const teachersRes = await fetch(
          `/api/schools/class-teachers?school_id=${schoolData.school_id}`,
          { credentials: 'include', cache: 'no-store' }
        );
        const teachersData = await teachersRes.json();
        setTeachers(
          (teachersData.teachers || []).map((t) => ({
            id: t.id,
            user: { full_name: t.full_name },
          }))
        );
      } catch {
        setTeachers([]);
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Could not load classes');
      setClasses([]);
    }
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', arm: '', assigned_teacher_id: '' });
    setModalOpen(true);
  };

  const openEdit = (cls) => {
    setEditing(cls);
    setForm({
      name: cls.name,
      arm: cls.section || '',
      assigned_teacher_id: cls.assigned_teacher_id || '',
    });
    setModalOpen(true);
  };

  const saveClass = async () => {
    if (!form.name.trim() || !form.arm.trim()) {
      toast.error('Class name and arm are required');
      return;
    }
    setSaving(true);
    try {
      const method = editing ? 'PUT' : 'POST';
      const payload = {
        name: form.name.trim(),
        grade: form.name.trim(),
        section: form.arm.trim().toUpperCase(),
        assigned_teacher_id: form.assigned_teacher_id || null,
      };
      const body = editing
        ? { id: editing.id, school_id: schoolId, ...payload }
        : { school_id: schoolId, ...payload };

      const res = await fetch('/api/classes', {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      toast.success(editing ? 'Class updated' : 'Class created');
      setModalOpen(false);
      await loadAll();
    } catch (e) {
      toast.error(e.message || 'Save failed');
    }
    setSaving(false);
  };

  const deleteClass = async (cls) => {
    const label = cls.section ? `${cls.name} (Arm ${cls.section})` : cls.name;
    if (!confirm(`Delete class "${label}"?`)) return;
    try {
      const res = await fetch(`/api/classes?id=${cls.id}&school_id=${schoolId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success('Class removed');
      await loadAll();
    } catch (e) {
      toast.error(e.message || 'Delete failed');
    }
  };

  const teacherName = (cls) => {
    const t = cls.assigned_teacher;
    if (!t) {
      const byId = teachers.find((tp) => tp.id === cls.assigned_teacher_id);
      if (byId?.user?.full_name) return byId.user.full_name;
      return 'No teacher assigned';
    }
    const u = Array.isArray(t.user) ? t.user[0] : t.user;
    return u?.full_name || 'Teacher';
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-primary-600">Loading...</div></div>;
  }

  return (
    <div className="p-6 min-h-screen pt-14 md:pt-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Classes</h1>
          <p className="text-sm text-gray-500">{classes.length} active classes</p>
        </div>
        <button type="button" onClick={openCreate} className="btn-primary flex items-center gap-1 text-sm">
          <Plus size={16} /> Add class
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {classes.map((cls) => (
          <div key={cls.id} className="card">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold">
                  {cls.name}{cls.section ? ` · Arm ${cls.section}` : ''}
                </h3>
                <p className="text-xs text-gray-400 mt-1">{teacherName(cls)}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                <Users size={18} className="text-primary-600" />
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-3">{cls.student_count ?? 0} students</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => openEdit(cls)} className="btn-secondary text-xs flex-1 flex items-center justify-center gap-1">
                <Pencil size={14} /> Edit
              </button>
              <button type="button" onClick={() => deleteClass(cls)} className="btn-danger text-xs px-3">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {classes.length === 0 && (
          <div className="col-span-full card text-center py-12 text-gray-400">
            No classes yet. Click Add class to create one, or run setup to import classes.
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">{editing ? 'Edit class' : 'New class'}</h2>
              <button type="button" onClick={() => setModalOpen(false)}><X size={20} /></button>
            </div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Class name *</label>
            <input className="input mb-3" placeholder="e.g. Primary 4" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <label className="text-xs font-medium text-gray-500 block mb-1">Arm *</label>
            <select className="input mb-3" value={form.arm} onChange={(e) => setForm((f) => ({ ...f, arm: e.target.value }))}>
              <option value="">Select arm…</option>
              {ARM_OPTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 -mt-2 mb-3">You can create the same class name with different arms (e.g. Primary 4 A, B, C).</p>
            <label className="text-xs font-medium text-gray-500 block mb-1">Class teacher (homeroom)</label>
            <select className="input mb-4" value={form.assigned_teacher_id} onChange={(e) => setForm((f) => ({ ...f, assigned_teacher_id: e.target.value }))}>
              <option value="">— None —</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.user?.full_name || 'Teacher'}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 -mt-3 mb-4">
              Class teachers and staff with a &quot;can be class teacher&quot; job role appear here.
            </p>
            <button type="button" onClick={saveClass} disabled={saving} className="btn-primary w-full py-3">
              {saving ? 'Saving…' : editing ? 'Update class' : 'Create class'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
