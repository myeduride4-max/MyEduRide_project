'use client';

import { useEffect, useRef, useState } from 'react';
import type { School } from '@/lib/types';
import { Building2, Users, Plus, Search, Settings, BarChart3, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { InitialPasswordFields } from '@/components/shared/InitialPasswordFields';
import { ExistingUsernameBanner } from '@/components/shared/ExistingUsernameBanner';
import { useUsernameLookup } from '@/hooks/useUsernameLookup';

interface SchoolWithStats extends School {
  student_count: number;
  staff_count: number;
  approval_status?: 'pending' | 'approved' | 'rejected';
}

export default function SuperAdminDashboard() {
  const [schools, setSchools] = useState<SchoolWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [totalStats, setTotalStats] = useState({ schools: 0, students: 0, staff: 0 });
  const modalOpenRef = useRef(false);

  useEffect(() => {
    modalOpenRef.current = showAddModal;
  }, [showAddModal]);

  useEffect(() => {
    fetchSchools();
    const onFocus = () => {
      // File picker closes → window focus → was refetching and unmounting the add-school modal
      if (modalOpenRef.current) return;
      fetchSchools({ silent: true });
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const fetchSchools = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch(`/api/schools/list?t=${Date.now()}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Could not load schools');
        setSchools([]);
        setTotalStats({ schools: 0, students: 0, staff: 0 });
        return;
      }

      const schoolsWithStats = data.schools || [];
      setSchools(schoolsWithStats);
      setTotalStats({
        schools: schoolsWithStats.length,
        students: schoolsWithStats.reduce((sum: number, s: SchoolWithStats) => sum + (s.student_count || 0), 0),
        staff: schoolsWithStats.reduce((sum: number, s: SchoolWithStats) => sum + (s.staff_count || 0), 0),
      });
    } catch (err) {
      console.error('Failed to fetch schools:', err);
      toast.error('Could not load schools');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleDeleteSchool = async (schoolId: string, schoolName: string) => {
    if (!confirm(`Are you sure you want to delete "${schoolName}"? This will remove all associated data.`)) return;

    const res = await fetch(`/api/schools/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ school_id: schoolId }),
      cache: 'no-store',
    });

    if (res.ok) {
      // Refetch fresh from Supabase
      fetchSchools({ silent: true });
      toast.success(`${schoolName} deleted`);
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Failed to delete school');
    }
  };

  const pendingSchools = schools.filter((s) => s.approval_status === 'pending');
  const approvedSchools = schools.filter((s) => s.approval_status !== 'pending');

  const filteredSchools = approvedSchools.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.address || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleApproveSchool = async (schoolId: string, action: 'approve' | 'reject') => {
    const res = await fetch('/api/schools/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ school_id: schoolId, action }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || 'Failed');
      return;
    }
    toast.success(action === 'approve' ? 'School approved' : 'School rejected');
    fetchSchools({ silent: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-primary-600">Loading schools...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="p-6 max-w-6xl mx-auto pb-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Platform Overview</h1>
            <p className="text-sm text-gray-500">Manage all schools across MyEduRide</p>
          </div>
        </div>
        {/* Platform stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="card flex items-center gap-4 py-5">
            <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center">
              <Building2 size={22} className="text-primary-600" />
            </div>
            <div>
              <p className="text-3xl font-bold">{totalStats.schools}</p>
              <p className="text-sm text-gray-500">Schools</p>
            </div>
          </div>
          <div className="card flex items-center gap-4 py-5">
            <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
              <Users size={22} className="text-green-600" />
            </div>
            <div>
              <p className="text-3xl font-bold">{totalStats.students}</p>
              <p className="text-sm text-gray-500">Total Students</p>
            </div>
          </div>
          <div className="card flex items-center gap-4 py-5">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
              <BarChart3 size={22} className="text-amber-600" />
            </div>
            <div>
              <p className="text-3xl font-bold">{totalStats.staff}</p>
              <p className="text-sm text-gray-500">Total Staff</p>
            </div>
          </div>
        </div>

        {pendingSchools.length > 0 && (
          <div className="card mb-6 border-amber-200 bg-amber-50/50">
            <h2 className="font-bold text-amber-900 mb-3">
              Pending school registrations ({pendingSchools.length})
            </h2>
            <div className="space-y-3">
              {pendingSchools.map((school) => (
                <div
                  key={school.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white rounded-xl border border-amber-100"
                >
                  <div>
                    <p className="font-semibold text-gray-900">{school.name}</p>
                    {school.address && <p className="text-xs text-gray-500">{school.address}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleApproveSchool(school.id, 'reject')}
                      className="btn-secondary text-sm"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApproveSchool(school.id, 'approve')}
                      className="btn-primary text-sm"
                    >
                      Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search + Add */}
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search schools..."
              className="input pl-10"
            />
          </div>
          <button type="button" onClick={() => fetchSchools({ silent: true })} className="btn-secondary flex items-center gap-1" disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-1">
            <Plus size={16} />
            Add School
          </button>
        </div>

        {/* Schools list — scrollable when many schools */}
        <div className="space-y-3 max-h-[calc(100vh-22rem)] overflow-y-auto pr-1">
          {filteredSchools.map(school => (
            <div key={school.id} className="card flex items-center gap-4 py-4 cursor-pointer hover:shadow-md transition-all" onClick={() => window.location.href = `/dashboard/super-admin/school/${school.id}`}>
              {school.logo_url ? (
                <img
                  src={`/api/photo?path=${encodeURIComponent(school.logo_url)}`}
                  alt=""
                  className="w-12 h-12 rounded-xl object-contain border border-gray-200 bg-white shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center text-primary-700 font-bold shrink-0">
                  {school.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold truncate">{school.name}</h3>
                <p className="text-sm text-gray-500 truncate">{school.address || 'No address'}</p>
              </div>
              <div className="text-center px-4">
                <p className="text-lg font-bold text-primary-600">{school.student_count}</p>
                <p className="text-xs text-gray-500">Students</p>
              </div>
              <div className="text-center px-4">
                <p className="text-lg font-bold text-green-600">{school.staff_count}</p>
                <p className="text-xs text-gray-500">Staff</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteSchool(school.id, school.name); }}
                  className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                  title="Delete school"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}

          {filteredSchools.length === 0 && (
            <div className="card text-center text-gray-500 py-8">
              {searchQuery ? 'No schools match your search' : 'No schools yet. Add your first school.'}
            </div>
          )}
        </div>
      </main>

      {showAddModal && (
        <AddSchoolModal
          onClose={() => setShowAddModal(false)}
          onSuccess={(newSchool) => {
            setShowAddModal(false);
            if (newSchool) {
              setSchools((prev) => {
                const exists = prev.some((s) => s.id === newSchool.id);
                const next = exists ? prev : [...prev, newSchool];
                setTotalStats({
                  schools: next.length,
                  students: next.reduce((sum, s) => sum + (s.student_count || 0), 0),
                  staff: next.reduce((sum, s) => sum + (s.staff_count || 0), 0),
                });
                return next;
              });
            }
            fetchSchools({ silent: true });
          }}
        />
      )}
    </div>
  );
}

// ============ ADD SCHOOL MODAL ============
function AddSchoolModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (school?: SchoolWithStats) => void;
}) {
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    admin_username: '',
    admin_name: '',
    admin_phone: '',
    admin_email: '',
    admin_password: '',
    confirm_password: '',
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const { existingUser: existingAdmin, checking: checkingAdmin } = useUsernameLookup(formData.admin_username);

  useEffect(() => {
    if (!existingAdmin) return;
    setFormData((prev) => ({
      ...prev,
      admin_username: existingAdmin.username,
      admin_name: existingAdmin.full_name || prev.admin_name,
      admin_phone: existingAdmin.phone || prev.admin_phone,
      admin_email: existingAdmin.email || prev.admin_email,
    }));
  }, [existingAdmin]);

  const handleLogoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.target.files?.[0];
    if (!file) return;

    const name = file.name.toLowerCase();
    const okType =
      ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      name.endsWith('.jpg') ||
      name.endsWith('.jpeg') ||
      name.endsWith('.png') ||
      name.endsWith('.webp');

    if (!okType) {
      toast.error('Use JPG, PNG, or WebP for the school logo');
      if (logoInputRef.current) logoInputRef.current.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Logo must be 5 MB or smaller');
      if (logoInputRef.current) logoInputRef.current.value = '';
      return;
    }

    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview((ev.target?.result as string) || '');
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/schools/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      });

      const result = await response.json();
      if (result.success) {
        const schoolId = result.school_id || result.school?.id;
        if (logoFile && schoolId) {
          const fd = new FormData();
          fd.append('school_id', schoolId);
          fd.append('file', logoFile);
          const logoRes = await fetch('/api/schools/logo', {
            method: 'POST',
            credentials: 'include',
            body: fd,
          });
          const logoJson = await logoRes.json();
          if (!logoRes.ok) {
            toast.error(logoJson.error || 'School created but logo upload failed');
          } else if (logoJson.path && result.school) {
            result.school.logo_url = logoJson.path;
          }
        }
        toast.success(
          `${formData.name} created — username: ${result.admin_username || formData.admin_username}, password: ${result.admin_password || formData.admin_password}`,
          { duration: 12000 }
        );
        onSuccess(result.school);
      } else {
        toast.error(result.error || 'Failed to create school');
      }
    } catch {
      toast.error('Failed to create school');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Building2 size={20} className="text-primary-600" />
          Add New School
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">School Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="input"
              placeholder="e.g. Greenfield Academy"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
              className="input"
              placeholder="School address"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">School Logo (optional)</label>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              onChange={handleLogoPick}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-primary-50 file:text-primary-700 file:font-medium"
            />
            <p className="text-xs text-gray-400 mt-1">JPG, PNG or WebP · max 5 MB · uploaded when you create the school</p>
            {logoPreview && (
              <div className="mt-2 p-2 bg-gray-50 rounded-lg inline-block">
                <img src={logoPreview} alt="Preview" className="h-10 object-contain" />
              </div>
            )}
          </div>

          <hr className="my-4" />
          <p className="text-sm font-medium text-gray-700">School Admin (first admin for this school)</p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Admin Username</label>
            <input
              type="text"
              value={formData.admin_username}
              onChange={(e) => setFormData(prev => ({ ...prev, admin_username: e.target.value.toLowerCase().replace(/\s/g, '') }))}
              className="input"
              placeholder="school_admin"
              required
            />
            <ExistingUsernameBanner user={existingAdmin} checking={checkingAdmin} roleHint="school admin" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email (optional, for notifications)</label>
            <input
              type="email"
              value={formData.admin_email}
              onChange={(e) => setFormData(prev => ({ ...prev, admin_email: e.target.value }))}
              className="input"
              placeholder="admin@school.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Admin Full Name</label>
            <input
              type="text"
              value={formData.admin_name}
              onChange={(e) => setFormData(prev => ({ ...prev, admin_name: e.target.value }))}
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Admin Phone</label>
            <input
              type="tel"
              value={formData.admin_phone}
              onChange={(e) => setFormData(prev => ({ ...prev, admin_phone: e.target.value }))}
              className="input"
            />
          </div>

          <InitialPasswordFields
            password={formData.admin_password}
            confirmPassword={formData.confirm_password}
            onPasswordChange={(v) => setFormData((prev) => ({ ...prev, admin_password: v }))}
            onConfirmChange={(v) => setFormData((prev) => ({ ...prev, confirm_password: v }))}
            label="Admin default password"
          />

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Creating...' : 'Create School'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
