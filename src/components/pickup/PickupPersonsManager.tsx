// @ts-nocheck
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Camera, User, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { photoSrc } from '@/lib/photo';

/**
 * Admin: manage all school pickup persons.
 * Parent: manage pickup persons for their children only (mode="parent").
 */
export default function PickupPersonsManager({
  schoolId,
  mode = 'admin',
  students = [],
}) {
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState(null);
  const [saving, setSaving] = useState(false);
  const [photoPreview, setPhotoPreview] = useState('');
  const [form, setForm] = useState({
    name: '',
    relationship: '',
    phone: '',
    student_ids: [],
    photo_url: '',
  });

  const load = useCallback(async () => {
    if (!schoolId && mode === 'admin') return;
    setLoading(true);
    try {
      if (mode === 'admin') {
        const res = await fetch(`/api/pickup-persons?school_id=${schoolId}`, { credentials: 'include' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setPersons(json.pickup_persons || []);
      } else if (students[0]) {
        const byId = new Map();
        for (const child of students) {
          const res = await fetch(`/api/pickup-persons?student_id=${child.id}`, { credentials: 'include' });
          const json = await res.json();
          (json.pickup_persons || []).forEach((p) => {
            const label = `${child.first_name} ${child.last_name}`;
            const existing = byId.get(p.id);
            if (existing) {
              if (!existing._childNames.includes(label)) {
                existing._childNames.push(label);
                existing._linkedChildren = existing._childNames.join(', ');
              }
            } else {
              byId.set(p.id, {
                ...p,
                _childName: label,
                _childNames: [label],
                _linkedChildren: label,
              });
            }
          });
        }
        setPersons([...byId.values()]);
      }
    } catch (e) {
      toast.error(e.message || 'Could not load pickup list');
    }
    setLoading(false);
  }, [schoolId, mode, students]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (mode === 'parent' && students.length === 1 && form.student_ids.length === 0) {
      setForm((f) => ({ ...f, student_ids: [students[0].id] }));
    }
  }, [mode, students, form.student_ids.length]);

  const selectAllChildren = () => {
    setForm((f) => ({ ...f, student_ids: students.map((s) => s.id) }));
  };

  const allChildrenSelected =
    students.length > 0 && students.every((s) => form.student_ids.includes(s.id));

  const uploadPhoto = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', `pickup-persons/${schoolId || 'parent'}`);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Photo upload failed');
    return json.url;
  };

  const onPhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setPhotoPreview(URL.createObjectURL(file));
      const url = await uploadPhoto(file);
      setForm((f) => ({ ...f, photo_url: url }));
      toast.success('Photo saved');
    } catch (err) {
      toast.error(err.message || 'Photo failed');
    }
  };

  const save = async () => {
    if (!form.name.trim() || !form.relationship.trim()) {
      toast.error('Name and relationship required');
      return;
    }
    if (!form.student_ids.length) {
      toast.error('Select at least one child');
      return;
    }
    if (mode === 'parent' && !form.photo_url) {
      toast.error('Please add a photo so the gate officer can verify this person at release');
      return;
    }
    setSaving(true);
    try {
      const resolvedSchoolId =
        schoolId || students.find((s) => form.student_ids.includes(s.id))?.school_id;
      if (!resolvedSchoolId) throw new Error('School not found');

      const isEdit = !!editingPerson;
      const res = await fetch('/api/pickup-persons', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(
          isEdit
            ? {
                id: editingPerson.id,
                school_id: resolvedSchoolId,
                name: form.name,
                relationship: form.relationship,
                phone: form.phone,
                photo_url: form.photo_url,
                student_ids: form.student_ids,
              }
            : {
                school_id: resolvedSchoolId,
                name: form.name,
                relationship: form.relationship,
                phone: form.phone,
                photo_url: form.photo_url,
                student_ids: form.student_ids,
              }
        ),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(isEdit ? 'Pickup person updated' : 'Pickup person added — gate and admin notified');
      setFormOpen(false);
      setEditingPerson(null);
      setForm({ name: '', relationship: '', phone: '', student_ids: [], photo_url: '' });
      setPhotoPreview('');
      load();
    } catch (e) {
      toast.error(e.message || 'Save failed');
    }
    setSaving(false);
  };

  const openEdit = (person) => {
    const linkIds = (person.students || [])
      .map((l) => {
        const st = l.student;
        const s = Array.isArray(st) ? st[0] : st;
        return s?.id;
      })
      .filter(Boolean);
    setEditingPerson(person);
    setForm({
      name: person.name,
      relationship: person.relationship,
      phone: person.phone || '',
      student_ids: linkIds.length ? linkIds : students.map((s) => s.id),
      photo_url: person.photo_url || '',
    });
    setPhotoPreview(person.photo_url ? photoSrc(person.photo_url) : '');
    setFormOpen(true);
  };

  const remove = async (person) => {
    const sid = schoolId || students[0]?.school_id;
    if (!confirm(`Remove ${person.name} from authorised pickup list?`)) return;
    try {
      const res = await fetch(`/api/pickup-persons?id=${person.id}&school_id=${sid}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success('Removed');
      load();
    } catch (e) {
      toast.error(e.message || 'Delete failed');
    }
  };

  const linkedStudents = (person) => {
    const links = person.students || [];
    return links.map((l) => {
      const st = l.student;
      const s = Array.isArray(st) ? st[0] : st;
      return s ? `${s.first_name} ${s.last_name}` : '';
    }).filter(Boolean).join(', ');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start gap-2">
        <div>
          <h2 className="font-bold text-slate-900">Authorised pickup persons</h2>
          <p className="text-xs text-slate-500 mt-1">
            {mode === 'parent'
              ? persons.length > 0
                ? 'Your list is saved. Only the school can add or remove people — contact them if you need changes.'
                : 'Register who may collect your child. After you save, only the school can change this list.'
              : 'People allowed to pick up students. Parents can add once; you manage the full list here.'}
          </p>
        </div>
        {!(mode === 'parent' && persons.length > 0) && (
          <button type="button" onClick={() => setFormOpen(true)} className="btn-primary text-sm flex items-center gap-1 shrink-0">
            <Plus size={16} /> Add
          </button>
        )}
      </div>

      {loading && <p className="text-sm text-slate-400 animate-pulse">Loading…</p>}

      {!loading && persons.length === 0 && (
        <div className="card text-center py-8 text-slate-400 text-sm">No pickup persons yet</div>
      )}

      <div className="grid gap-3">
        {persons.map((p) => (
          <div key={p.id} className="card flex gap-3 items-start">
            {p.photo_url ? (
              <img src={photoSrc(p.photo_url)} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <User size={24} className="text-slate-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900">{p.name}</p>
              <p className="text-xs text-slate-500">{p.relationship}{p.phone ? ` · ${p.phone}` : ''}</p>
              <p className="text-xs text-slate-600 mt-1">
                {mode === 'admin'
                  ? linkedStudents(p) || 'No students linked'
                  : p._linkedChildren || p._childName}
              </p>
            </div>
            {mode === 'admin' ? (
              <div className="flex gap-1 shrink-0">
                <button type="button" onClick={() => openEdit(p)} className="btn-secondary p-2 min-h-[44px] min-w-[44px]" aria-label="Edit">
                  <Pencil size={16} />
                </button>
                <button type="button" onClick={() => remove(p)} className="btn-danger p-2 min-h-[44px] min-w-[44px]" aria-label="Delete">
                  <Trash2 size={16} />
                </button>
              </div>
            ) : (
              <span className="text-[10px] text-slate-400 shrink-0 text-right">
                Removal by school only
              </span>
            )}
          </div>
        ))}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
            <h3 className="font-bold text-lg mb-3">{editingPerson ? 'Edit pickup person' : 'Add pickup person'}</h3>
            <label className="text-xs font-medium text-slate-500 block mb-1">
              Photo {mode === 'parent' ? '(required for gate verification)' : '(recommended)'}
            </label>
            <div className="flex items-center gap-3 mb-3">
              {photoPreview || form.photo_url ? (
                <img src={photoPreview || photoSrc(form.photo_url)} alt="" className="w-16 h-16 rounded-xl object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center">
                  <Camera size={22} className="text-slate-400" />
                </div>
              )}
              <label className="btn-secondary text-sm cursor-pointer">
                Take / upload photo
                <input type="file" accept="image/*" capture="user" className="hidden" onChange={onPhotoChange} />
              </label>
            </div>
            <input className="input mb-2" placeholder="Full name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <input className="input mb-2" placeholder="Relationship * (e.g. Uncle, Driver)" value={form.relationship} onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value }))} />
            <input className="input mb-2" placeholder="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-xs font-medium text-slate-500">Linked children *</p>
              {students.length > 1 && (
                <button
                  type="button"
                  onClick={selectAllChildren}
                  className="text-xs font-semibold text-primary-600"
                >
                  {allChildrenSelected ? 'All selected' : 'Select all children'}
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mb-2">
              One photo — select every child this person may pick up. Gate will show their face for each child.
            </p>
            <div className="space-y-1 mb-4 max-h-32 overflow-y-auto">
              {students.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm py-1">
                  <input
                    type="checkbox"
                    checked={form.student_ids.includes(s.id)}
                    onChange={(e) => {
                      setForm((f) => ({
                        ...f,
                        student_ids: e.target.checked
                          ? [...f.student_ids, s.id]
                          : f.student_ids.filter((id) => id !== s.id),
                      }));
                    }}
                  />
                  {s.first_name} {s.last_name}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setFormOpen(false); setEditingPerson(null); }} className="btn-secondary flex-1">Cancel</button>
              <button type="button" onClick={save} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
