// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchData } from '@/lib/api';
import { GraduationCap, DoorOpen, Shield, User } from 'lucide-react';
import { toast } from 'sonner';
import FaceCapture from '@/components/shared/FaceCapture';
import { InitialPasswordFields } from '@/components/shared/InitialPasswordFields';
import StaffIdPhoto from '@/components/shared/StaffIdPhoto';
import { ExistingUsernameBanner } from '@/components/shared/ExistingUsernameBanner';
import { validatePasswordPair } from '@/lib/auth/password-policy';
import { useUsernameLookup } from '@/hooks/useUsernameLookup';

const ACCESS_OPTIONS = [
  { value: 'staff', label: 'Staff (sign-in + own attendance)', icon: User },
  { value: 'teacher', label: 'Class teacher (class + dismissal)', icon: GraduationCap },
  { value: 'gate_officer', label: 'Gate officer', icon: DoorOpen },
  { value: 'school_admin', label: 'School admin', icon: Shield },
];

export default function AddStaffForm({ schoolId, customRoles, onSuccess, onCancel }) {
  const router = useRouter();
  const [form, setForm] = useState({
    full_name: '',
    username: '',
    contact_email: '',
    phone: '',
    access_role: 'staff',
    custom_role_id: '',
    class_id: '',
  });
  const [faceData, setFaceData] = useState({ photos: [], face_descriptor: null });
  const [idPhoto, setIdPhoto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState([]);
  const [initialPassword, setInitialPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { existingUser, taken, checking } = useUsernameLookup(form.username, {
    schoolId,
    scope: 'staff',
  });

  useEffect(() => {
    if (!existingUser || taken) return;
    setForm((f) => ({
      ...f,
      username: existingUser.username,
      full_name: existingUser.full_name || f.full_name,
      phone: existingUser.phone || f.phone,
      contact_email: existingUser.email || f.contact_email,
    }));
  }, [existingUser, taken]);

  const selectedCustom = customRoles.find((r) => r.id === form.custom_role_id);
  const mayAssignClass =
    form.access_role === 'teacher' || (form.access_role === 'staff' && selectedCustom?.can_assign_class);

  useEffect(() => {
    fetchData('get_classes', { school_id: schoolId })
      .then((d) => setClasses(d.classes || []))
      .catch(() => {});
  }, [schoolId]);

  useEffect(() => {
    if (form.access_role === 'staff' && customRoles.length === 1) {
      setForm((f) => ({ ...f, custom_role_id: customRoles[0].id }));
    }
  }, [customRoles, form.access_role]);

  const handleSubmit = async () => {
    if (!form.full_name || !form.username) {
      toast.error('Name and username required');
      return;
    }
    if (taken) {
      toast.error('This username is already in use. Choose a different username.');
      return;
    }
    if (form.access_role === 'staff' && !form.custom_role_id) {
      toast.error('Select a job role (create one on Staff list first)');
      return;
    }
    if (form.access_role === 'gate_officer' && faceData.photos.length < 3) {
      toast.error('Gate officers need 3 face photos');
      return;
    }
    const needsPassword = !existingUser;
    if (needsPassword) {
      const pwErr = validatePasswordPair(initialPassword, confirmPassword);
      if (pwErr) {
        toast.error(pwErr);
        return;
      }
    } else if (initialPassword || confirmPassword) {
      const pwErr = validatePasswordPair(initialPassword, confirmPassword);
      if (pwErr) {
        toast.error(pwErr);
        return;
      }
    }

    setLoading(true);
    const res = await fetch('/api/staff/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: form.full_name,
        username: form.username,
        contact_email: form.contact_email || null,
        phone: form.phone,
        role: form.access_role,
        school_id: schoolId,
        custom_role_id: form.access_role === 'staff' ? form.custom_role_id : null,
        class_id: mayAssignClass ? form.class_id || null : null,
        photo_base64: idPhoto || faceData.photos[0] || null,
        face_photos: faceData.photos,
        face_descriptor: faceData.face_descriptor,
        skip_face: form.access_role !== 'gate_officer',
        initial_password: initialPassword || undefined,
        confirm_password: confirmPassword || undefined,
      }),
    });
    const d = await res.json();
    if (res.ok) {
      if (d.password) {
        toast.success(`Staff added — username: ${d.username}, password: ${d.password}`, { duration: 10000 });
      } else if (d.staff_profile?.photo_url) {
        toast.success('Staff added with ID photo');
      } else {
        toast.success('Staff added — add ID photo anytime for ID card PDF');
      }
      if (onSuccess) onSuccess();
      else router.push('/dashboard/school-admin/staff');
    } else {
      toast.error(d.error || 'Failed');
    }
    setLoading(false);
  };

  return (
    <div className="card-elevated p-6 max-w-md w-full">
      <h2 className="text-lg font-bold mb-4">Add staff member</h2>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Username *</label>
          <input
            type="text"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, '') })}
            className="input"
            placeholder="e.g. jsmith"
          />
          <ExistingUsernameBanner user={existingUser} checking={checking} taken={taken} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Full name *</label>
          <input
            type="text"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            className="input"
          />
        </div>
        {!existingUser ? (
          <InitialPasswordFields
            password={initialPassword}
            confirmPassword={confirmPassword}
            onPasswordChange={setInitialPassword}
            onConfirmChange={setConfirmPassword}
            label="Default login password"
            hint="Share username and password with this person. They should change it after first login."
          />
        ) : (
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
            Existing account — leave password blank to keep their current login, or enter a new one to reset it.
          </p>
        )}
        {existingUser && (initialPassword || confirmPassword) && (
          <InitialPasswordFields
            password={initialPassword}
            confirmPassword={confirmPassword}
            onPasswordChange={setInitialPassword}
            onConfirmChange={setConfirmPassword}
            label="New password (optional)"
            hint="Only fill this if you want to reset their login password."
          />
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Contact email (optional)</label>
          <input
            type="email"
            value={form.contact_email}
            onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="input"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">App access *</label>
          <select
            value={form.access_role}
            onChange={(e) =>
              setForm({ ...form, access_role: e.target.value, class_id: '', custom_role_id: '' })
            }
            className="input"
          >
            {ACCESS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {form.access_role === 'staff' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Job title *</label>
            <select
              value={form.custom_role_id}
              onChange={(e) => setForm({ ...form, custom_role_id: e.target.value, class_id: '' })}
              className="input"
            >
              <option value="">Select role...</option>
              {customRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.can_assign_class ? ' (may have class)' : ''}
                </option>
              ))}
            </select>
            {customRoles.length === 0 && (
              <p className="text-xs text-amber-700 mt-1">
                Add job roles on the Staff list page first.
              </p>
            )}
          </div>
        )}

        {mayAssignClass && classes.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Assign class (optional)</label>
            <select
              value={form.class_id}
              onChange={(e) => setForm({ ...form, class_id: e.target.value })}
              className="input"
            >
              <option value="">No class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.section ? ` · Arm ${c.section}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {form.access_role !== 'gate_officer' && (
          <StaffIdPhoto label="ID card photo" optional onChange={setIdPhoto} />
        )}

        {form.access_role === 'gate_officer' && (
          <div className="border-t pt-3 space-y-3">
            <StaffIdPhoto label="ID card photo" optional onChange={setIdPhoto} />
            <FaceCapture label="Gate face enrollment (3 photos)" minPhotos={3} maxPhotos={3} onChange={setFaceData} />
          </div>
        )}

        {form.access_role === 'staff' && (
          <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2">
            Staff sign in with their ID card at the gate. Photo is optional now — add it anytime for ID card PDFs.
          </p>
        )}
      </div>
      <div className="flex gap-3 mt-5">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          Cancel
        </button>
        <button type="button" onClick={handleSubmit} disabled={loading} className="btn-primary flex-1">
          {loading ? 'Adding...' : 'Add staff'}
        </button>
      </div>
    </div>
  );
}
