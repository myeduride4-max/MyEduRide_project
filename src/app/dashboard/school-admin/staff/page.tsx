// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { fetchData } from '@/lib/api';
import { Plus, Trash2, GraduationCap, DoorOpen, Shield, User, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import StudentAvatar from '@/components/shared/StudentAvatar';

export default function StaffManagementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [staff, setStaff] = useState([]);
  const [customRoles, setCustomRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolId] = useState('');

  useEffect(() => {
    if (searchParams.get('add') === '1') {
      router.replace('/dashboard/school-admin/staff/new');
      return;
    }
    loadStaff();
  }, [searchParams, router]);

  const loadStaff = async () => {
    try {
      const schoolData = await fetchData('get_school_admin_data', { role: 'school_admin' });
      if (!schoolData.school_id) {
        setLoading(false);
        return;
      }
      setSchoolId(schoolData.school_id);

      const [staffRes, rolesRes] = await Promise.all([
        fetch(`/api/schools/staff?school_id=${schoolData.school_id}&ensure_profiles=1`, {
          credentials: 'include',
          cache: 'no-store',
        }),
        fetch(`/api/schools/custom-roles?school_id=${schoolData.school_id}`, {
          credentials: 'include',
          cache: 'no-store',
        }),
      ]);

      const staffData = await staffRes.json();
      const rolesData = await rolesRes.json();
      setStaff(staffData.staff || []);
      setCustomRoles(rolesData.roles || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleDelete = async (member, name) => {
    const ids = member.role_ids || [member.id];
    if (!confirm(`Remove ${name} from this school?`)) return;
    for (const roleId of ids) {
      await fetch('/api/staff/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_id: roleId }),
      });
    }
    toast.success('Removed');
    loadStaff();
  };

  const handleAddPhoto = async (userId, photoBase64) => {
    const res = await fetch('/api/staff/photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ school_id: schoolId, user_id: userId, photo_base64: photoBase64 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    toast.success('Photo saved — you can generate ID card now');
    loadStaff();
  };

  const getRoleIcon = (role) => {
    if (role === 'teacher') return <GraduationCap size={14} className="text-blue-600" />;
    if (role === 'gate_officer') return <DoorOpen size={14} className="text-orange-600" />;
    if (role === 'school_admin') return <Shield size={14} className="text-purple-600" />;
    return <User size={14} className="text-slate-600" />;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center md:ml-56">
        <div className="animate-pulse text-primary-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen md:ml-56 pt-14 md:pt-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 pr-12 md:pr-0">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">Staff list ({staff.length})</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            All staff at your school. Use Add staff to create new members.
          </p>
        </div>
        <Link
          href="/dashboard/school-admin/staff/new"
          className="btn-primary flex items-center justify-center gap-2 text-sm shrink-0 w-full sm:w-auto"
        >
          <Plus size={16} /> Add staff
        </Link>
      </div>

      <CustomRolesPanel schoolId={schoolId} roles={customRoles} onChange={loadStaff} />

      <div className="card-elevated divide-y divide-slate-100 mt-6">
        {staff.map((s) => (
          <div key={s.user_id || s.id} className="list-row gap-4 flex-wrap sm:flex-nowrap">
            <StudentAvatar
              photoUrl={s.staff?.photo_url}
              firstName={s.profile?.full_name?.split(' ')[0]}
              lastName={s.profile?.full_name?.split(' ').slice(1).join(' ')}
              size="sm"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{s.profile?.full_name || 'Unknown'}</p>
              <p className="text-xs text-slate-500 truncate">@{s.profile?.username || 'no-username'}</p>
              {s.staff?.staff_id_number && (
                <p className="text-xs font-mono text-slate-600">{s.staff.staff_id_number}</p>
              )}
              {!s.staff?.photo_url && (
                <p className="text-[10px] text-amber-700 mt-0.5">No ID photo — add below for ID card</p>
              )}
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 capitalize flex items-center gap-1 shrink-0 max-w-[180px] truncate">
              {getRoleIcon(s.roles?.[0] || s.role)} {s.job_title || s.role?.replace('_', ' ')}
            </span>
            {!s.staff?.photo_url && s.user_id && (
              <label className="text-[10px] text-primary-700 font-semibold cursor-pointer shrink-0">
                Add photo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = async () => {
                      try {
                        await handleAddPhoto(s.user_id, reader.result);
                      } catch (err) {
                        toast.error(err?.message || 'Photo failed');
                      }
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
            <button
              type="button"
              onClick={() => handleDelete(s, s.profile?.full_name)}
              className="p-2 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-600 shrink-0"
              aria-label="Remove staff"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {staff.length === 0 && (
          <div className="py-12 text-center text-slate-400 text-sm">
            No staff yet — add job roles above, then{' '}
            <Link href="/dashboard/school-admin/staff/new" className="text-primary-600 font-medium">
              add staff
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function CustomRolesPanel({ schoolId, roles, onChange }) {
  const [name, setName] = useState('');
  const [canAssignClass, setCanAssignClass] = useState(false);
  const [saving, setSaving] = useState(false);

  const addRole = async () => {
    if (!name.trim()) {
      toast.error('Enter a role name');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/schools/custom-roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ school_id: schoolId, name: name.trim(), can_assign_class: canAssignClass }),
    });
    const data = await res.json();
    if (!res.ok) toast.error(data.error || 'Failed');
    else {
      toast.success('Role added');
      setName('');
      setCanAssignClass(false);
      onChange();
    }
    setSaving(false);
  };

  const addPreset = async (presetName, assignClass) => {
    setSaving(true);
    const res = await fetch('/api/schools/custom-roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        school_id: schoolId,
        name: presetName,
        can_assign_class: assignClass,
      }),
    });
    if (res.ok) {
      toast.success(`${presetName} added`);
      onChange();
    }
    setSaving(false);
  };

  const removeRole = async (id) => {
    if (!confirm('Remove this job role? Existing staff keep their title until you edit them.')) return;
    await fetch(`/api/schools/custom-roles?id=${id}&school_id=${schoolId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    toast.success('Role removed');
    onChange();
  };

  return (
    <div className="card-elevated p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Briefcase size={18} className="text-primary-700" />
        <h2 className="font-bold text-slate-900">School job roles</h2>
      </div>
      <p className="text-xs text-slate-500">
        Create titles like Accountant, Cleaner, Subject teacher. Only roles marked &quot;class teacher&quot; can be linked to a class.
      </p>

      <div className="flex flex-wrap gap-2">
        {['Accountant', 'Cleaner', 'Subject teacher', 'Class teacher'].map((p) => {
          const exists = roles.some((r) => r.name.toLowerCase() === p.toLowerCase());
          if (exists) return null;
          return (
            <button
              key={p}
              type="button"
              disabled={saving}
              onClick={() => addPreset(p, p === 'Class teacher')}
              className="text-xs px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50"
            >
              + {p}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          className="input flex-1"
          placeholder="New role name (e.g. Librarian)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <label className="flex items-center gap-2 text-xs text-slate-600 shrink-0 px-2">
          <input type="checkbox" checked={canAssignClass} onChange={(e) => setCanAssignClass(e.target.checked)} />
          Can be class teacher
        </label>
        <button type="button" onClick={addRole} disabled={saving} className="btn-primary text-sm shrink-0">
          Add role
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {roles.map((r) => (
          <span
            key={r.id}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary-50 text-primary-900 border border-primary-100"
          >
            {r.name}
            {r.can_assign_class && <span className="text-[10px] opacity-70">· class</span>}
            <button type="button" onClick={() => removeRole(r.id)} className="text-primary-400 hover:text-red-600 ml-1">
              ×
            </button>
          </span>
        ))}
        {roles.length === 0 && <span className="text-xs text-slate-400">No custom roles yet</span>}
      </div>
    </div>
  );
}
