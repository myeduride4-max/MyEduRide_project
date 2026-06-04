// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchData } from '@/lib/api';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import FaceCapture from '@/components/shared/FaceCapture';
import { InitialPasswordFields } from '@/components/shared/InitialPasswordFields';
import { ExistingUsernameBanner } from '@/components/shared/ExistingUsernameBanner';
import { validatePasswordPair } from '@/lib/auth/password-policy';
import { useUsernameLookup } from '@/hooks/useUsernameLookup';

export default function AddStudentPage() {
  const [classes, setClasses] = useState([]);
  const [schoolId, setSchoolId] = useState('');
  const [form, setForm] = useState({
    first_name: '', last_name: '', address: '',
    parent_username: '', parent_name: '', parent_phone: '', parent_email: '', class_id: '',
  });
  const [faceData, setFaceData] = useState({ photos: [], face_descriptor: null });
  const [parentPassword, setParentPassword] = useState('');
  const [parentConfirmPassword, setParentConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const router = useRouter();
  const { existingUser: existingParent, taken: parentUsernameTaken, checking: checkingParent } =
    useUsernameLookup(form.parent_username, {
      schoolId: schoolId || undefined,
      scope: 'parent',
    });

  useEffect(() => {
    if (!existingParent || parentUsernameTaken) return;
    setForm((f) => ({
      ...f,
      parent_username: existingParent.username,
      parent_name: existingParent.full_name || f.parent_name,
      parent_phone: existingParent.phone || f.parent_phone,
      parent_email: existingParent.email || f.parent_email,
    }));
  }, [existingParent, parentUsernameTaken]);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const schoolData = await fetchData('get_school_admin_data', { role: 'school_admin' });
      if (!schoolData.school_id) { setPageLoading(false); return; }
      setSchoolId(schoolData.school_id);
      const { classes: classData } = await fetchData('get_classes', { school_id: schoolData.school_id });
      setClasses(classData || []);
    } catch (err) { console.error(err); }
    setPageLoading(false);
  };

  const handleSubmit = async () => {
    if (!form.first_name || !form.last_name) { toast.error('Name is required'); return; }
    if (faceData.photos.length < 3) { toast.error('Take 3 face photos of the student'); return; }
    const hasParent = form.parent_username?.trim() || form.parent_name?.trim() || form.parent_email?.trim();
    if (hasParent && !existingParent) {
      const pwErr = validatePasswordPair(parentPassword, parentConfirmPassword);
      if (pwErr) {
        toast.error(`Parent password: ${pwErr}`);
        return;
      }
    }
    if (hasParent && parentUsernameTaken) {
      toast.error('This parent username is already in use. Choose a different username.');
      return;
    }
    if (hasParent && !form.parent_username?.trim() && !form.parent_name?.trim()) {
      toast.error('Enter parent username or name');
      return;
    }
    setLoading(true);

    try {
      const res = await fetch('/api/students/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          class_id: form.class_id || null,
          first_name: form.first_name,
          last_name: form.last_name,
          photo_base64: faceData.photos[0] || null,
          face_descriptor: faceData.face_descriptor,
          custom_fields: {
            address: form.address,
            parent_username: form.parent_username,
            parent_name: form.parent_name,
            parent_phone: form.parent_phone,
            parent_email: form.parent_email,
          },
          parent_initial_password: hasParent && !existingParent ? parentPassword : undefined,
          parent_confirm_password: hasParent && !existingParent ? parentConfirmPassword : undefined,
        }),
      });
      const result = await res.json();
      if (result.success) {
        const id = result.student?.student_id_number || 'assigned';
        const hasPhoto = !!result.student?.photo_url;
        const linkedMsg = result.parent?.linked
          ? ` Linked to existing parent @${result.parent.username}.`
          : result.parent?.created
            ? ` Parent login: ${result.parent.username}.`
            : '';
        const warnMsg = result.parent?.warning ? ` Parent note: ${result.parent.warning}` : '';
        toast.success(
          hasPhoto
            ? `Student added with photo! ID: ${id}.${linkedMsg}${warnMsg}`
            : `Student added (ID: ${id}) — photo was not saved.${linkedMsg}${warnMsg}`
        );
        if (result.parent?.warning) {
          toast.error(result.parent.warning, { duration: 8000 });
        }
        router.push('/dashboard/school-admin/students');
      }
      else toast.error(result.error || 'Failed');
    } catch { toast.error('Failed'); }
    setLoading(false);
  };

  const handleCSVUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const text = await file.text();
    const rows = text.split('\n').map(r => r.split(',').map(c => c.trim()));
    const headers = rows[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
    const dataRows = rows.slice(1).filter(r => r.length >= 2 && r[0]);
    let imported = 0;
    for (const row of dataRows) {
      const record = {};
      headers.forEach((h, i) => { record[h] = row[i] || ''; });
      const res = await fetch('/api/students/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, class_id: form.class_id || null, first_name: record.first_name || '', last_name: record.last_name || '', custom_fields: record }),
      });
      if (res.ok) imported++;
    }
    toast.success(`Imported ${imported} students`);
    setLoading(false);
    router.push('/dashboard/school-admin/students');
  };

  if (pageLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-primary-600">Loading...</div></div>;

  return (
    <div className="p-6 min-h-screen">
      <div className="max-w-2xl mx-auto">
        <Link href="/dashboard/school-admin/students" className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4"><ArrowLeft size={16} /> Back</Link>
        <h1 className="text-2xl font-bold mb-6">Add Student</h1>

          <div className="space-y-5">
            {/* Student Info */}
            <div className="card">
              <h2 className="font-semibold mb-3">Student Information</h2>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">First Name *</label><input type="text" value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})} className="input" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Last Name *</label><input type="text" value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value})} className="input" /></div>
                <div className="col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Address</label><input type="text" value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="input" placeholder="Home address" /></div>
                {classes.length > 0 && (
                  <div className="col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Class</label>
                    <select value={form.class_id} onChange={e => setForm({...form, class_id: e.target.value})} className="input">
                      <option value="">Select class...</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.section ? ` · Arm ${c.section}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Parent Info */}
            <div className="card">
              <h2 className="font-semibold mb-3">Parent / Guardian</h2>
              <p className="text-xs text-gray-500 mb-3">
                Enter the parent username first. If they already exist, their details will auto-fill and this student will be linked — no duplicate account.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Parent username *</label>
                  <input
                    type="text"
                    value={form.parent_username}
                    onChange={(e) => setForm({ ...form, parent_username: e.target.value.toLowerCase().replace(/\s/g, '') })}
                    className="input"
                    placeholder="e.g. jsmith"
                  />
                  <ExistingUsernameBanner
                    user={existingParent}
                    checking={checkingParent}
                    taken={parentUsernameTaken}
                    roleHint="parent"
                  />
                </div>
                <div className="col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Parent name</label><input type="text" value={form.parent_name} onChange={e => setForm({...form, parent_name: e.target.value})} className="input" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Parent phone</label><input type="tel" value={form.parent_phone} onChange={e => setForm({...form, parent_phone: e.target.value})} className="input" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Parent email</label><input type="email" value={form.parent_email} onChange={e => setForm({...form, parent_email: e.target.value})} className="input" /></div>
              </div>
              {(form.parent_username?.trim() || form.parent_name?.trim() || form.parent_email?.trim()) && !existingParent && (
                <div className="mt-4">
                  <InitialPasswordFields
                    password={parentPassword}
                    confirmPassword={parentConfirmPassword}
                    onPasswordChange={setParentPassword}
                    onConfirmChange={setParentConfirmPassword}
                    label="Parent default password"
                    hint="Send username and password to the parent. They should change it after first login."
                  />
                </div>
              )}
              {existingParent && (
                <p className="text-xs text-gray-500 mt-3">
                  This student will be linked to the existing parent login. No new password is needed.
                </p>
              )}
            </div>

            <div className="card">
              <FaceCapture
                label="Student face & ID photo"
                minPhotos={3}
                maxPhotos={3}
                onChange={setFaceData}
              />
            </div>

            <button onClick={handleSubmit} disabled={loading || !form.first_name || !form.last_name || faceData.photos.length < 3}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2">
              {loading ? 'Adding...' : 'Add Student'} <CheckCircle size={16} />
            </button>
          </div>
      </div>
    </div>
  );
}
