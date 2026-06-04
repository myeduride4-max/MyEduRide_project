// @ts-nocheck
'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchData } from '@/lib/api';
import { Save, Clock, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { schoolToSettingsForm, TIME_FIELDS } from '@/lib/time-input';
import { AccountSettingsCard } from '@/components/shared/AccountSettingsCard';

export default function SchoolSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schoolId, setSchoolId] = useState('');
  const [formData, setFormData] = useState(schoolToSettingsForm(null));
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState('');
  const [signatureUploading, setSignatureUploading] = useState(false);
  const [signaturePreview, setSignaturePreview] = useState('');

  const loadSettings = useCallback(async (id) => {
    const sid = id || schoolId;
    if (!sid) return;
    try {
      const res = await fetch(`/api/schools/settings?school_id=${sid}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load settings');
      if (data.time_columns_available === false) {
        toast.error('Run supabase/schema.sql in Supabase to save gate times');
      }
      setFormData(schoolToSettingsForm(data.school));
      if (data.school?.logo_url) {
        setLogoPreview(`/api/photo?path=${encodeURIComponent(data.school.logo_url)}`);
      }
      if (data.school?.principal_signature_url) {
        setSignaturePreview(`/api/photo?path=${encodeURIComponent(data.school.principal_signature_url)}`);
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Could not load settings');
    }
  }, [schoolId]);

  useEffect(() => {
    (async () => {
      try {
        const schoolData = await fetchData('get_school_admin_data', { role: 'school_admin' });
        if (!schoolData.school_id) {
          setLoading(false);
          return;
        }
        setSchoolId(schoolData.school_id);
        await loadSettings(schoolData.school_id);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    })();

  }, [loadSettings]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!schoolId) {
      toast.error('School not loaded — refresh the page');
      return;
    }
    if (!formData.name.trim()) {
      toast.error('School name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        school_id: schoolId,
        name: formData.name,
        address: formData.address,
        logo_url: formData.logo_url,
        principal_signature_url: formData.principal_signature_url,
        welcome_message: formData.welcome_message,
        primary_color: formData.primary_color,
        secondary_color: formData.secondary_color,
      };
      for (const field of TIME_FIELDS) {
        payload[field] = formData[field];
      }
      const res = await fetch('/api/schools/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      if (data.migration_required) {
        toast.error('Gate times need supabase/schema.sql applied in Supabase');
      }
      if (data.school) {
        setFormData(schoolToSettingsForm(data.school));
      } else {
        await loadSettings(schoolId);
      }
      if (!data.migration_required) toast.success('Settings saved');
    } catch (err) {
      toast.error(err.message || 'Could not save settings');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-primary-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen pt-14 md:pt-6">
      <h1 className="text-2xl font-bold mb-6">School Settings</h1>

      <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
        <div className="card">
          <h2 className="font-semibold mb-4">School Information</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">School Name</label>
              <input type="text" value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input type="text" value={formData.address} onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">School Logo</label>
              <div className="flex items-center gap-3">
                {logoPreview && (
                  <img src={logoPreview} alt="Logo" className="h-12 w-12 object-contain rounded-lg border border-gray-200 bg-gray-50" />
                )}
                <label className="cursor-pointer flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700">
                  <Upload size={16} />
                  {logoUploading ? 'Uploading…' : 'Upload logo'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={logoUploading || !schoolId}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !schoolId) return;
                      setLogoUploading(true);
                      try {
                        const fd = new FormData();
                        fd.append('school_id', schoolId);
                        fd.append('file', file);
                        const res = await fetch('/api/schools/logo', {
                          method: 'POST',
                          credentials: 'include',
                          body: fd,
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || 'Upload failed');
                        setFormData((p) => ({ ...p, logo_url: data.path }));
                        setLogoPreview(data.preview_url || `/api/photo?path=${encodeURIComponent(data.path)}`);
                        toast.success('Logo uploaded');
                      } catch (err) {
                        toast.error(err.message || 'Logo upload failed');
                      }
                      setLogoUploading(false);
                    }}
                  />
                </label>
              </div>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG or WebP · max 5 MB</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
                <div className="flex gap-2">
                  <input type="color" value={formData.primary_color} onChange={(e) => setFormData((p) => ({ ...p, primary_color: e.target.value }))} className="w-10 h-10 rounded border" />
                  <input type="text" value={formData.primary_color} onChange={(e) => setFormData((p) => ({ ...p, primary_color: e.target.value }))} className="input flex-1" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Color</label>
                <div className="flex gap-2">
                  <input type="color" value={formData.secondary_color} onChange={(e) => setFormData((p) => ({ ...p, secondary_color: e.target.value }))} className="w-10 h-10 rounded border" />
                  <input type="text" value={formData.secondary_color} onChange={(e) => setFormData((p) => ({ ...p, secondary_color: e.target.value }))} className="input flex-1" />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Principal/Director Signature</label>
              <div className="flex items-center gap-3">
                {signaturePreview && (
                  <img src={signaturePreview} alt="Signature" className="h-12 w-24 object-contain rounded-lg border border-gray-200 bg-gray-50" />
                )}
                <label className="cursor-pointer flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700">
                  <Upload size={16} />
                  {signatureUploading ? 'Uploading…' : 'Upload signature'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={signatureUploading || !schoolId}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !schoolId) return;
                      setSignatureUploading(true);
                      try {
                        const fd = new FormData();
                        fd.append('school_id', schoolId);
                        fd.append('file', file);
                        const res = await fetch('/api/schools/signature', {
                          method: 'POST',
                          credentials: 'include',
                          body: fd,
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || 'Upload failed');
                        setFormData((p) => ({ ...p, principal_signature_url: data.path }));
                        setSignaturePreview(data.preview_url || `/api/photo?path=${encodeURIComponent(data.path)}`);
                        toast.success('Signature uploaded');
                      } catch (err) {
                        toast.error(err.message || 'Signature upload failed');
                      }
                      setSignatureUploading(false);
                    }}
                  />
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                Upload saves immediately (no need to click Save Settings). The image is stored in Supabase Storage and appears on the <strong>back</strong> of printed student ID cards when super admin generates PDFs.
                If no signature is uploaded, cards show &quot;Authorized by School&quot; instead.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Welcome Message (optional)</label>
              <input
                type="text"
                value={formData.welcome_message || ''}
                onChange={(e) => setFormData((p) => ({ ...p, welcome_message: e.target.value }))}
                className="input"
                placeholder="Welcome to [School Name]"
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Clock size={18} className="text-primary-600" /> Gate Hours (Lagos)
          </h2>
          <p className="text-xs text-gray-500 mb-4">Used for late marking and gate rules. Changes apply immediately after save.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gate Opens</label>
              <input type="time" value={formData.gate_open_time} onChange={(e) => setFormData((p) => ({ ...p, gate_open_time: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">School Starts</label>
              <input type="time" value={formData.school_start_time} onChange={(e) => setFormData((p) => ({ ...p, school_start_time: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Late Threshold</label>
              <input type="time" value={formData.late_threshold} onChange={(e) => setFormData((p) => ({ ...p, late_threshold: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gate Closes</label>
              <input type="time" value={formData.gate_close_time} onChange={(e) => setFormData((p) => ({ ...p, gate_close_time: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dismissal Start</label>
              <input type="time" value={formData.dismissal_start_time} onChange={(e) => setFormData((p) => ({ ...p, dismissal_start_time: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dismissal End</label>
              <input type="time" value={formData.dismissal_end_time} onChange={(e) => setFormData((p) => ({ ...p, dismissal_end_time: e.target.value }))} className="input" />
            </div>
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
          <Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>

      <div className="mt-8 card">
        <AccountSettingsCard />
      </div>
    </div>
  );
}
