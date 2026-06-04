// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchData } from '@/lib/api';
import { ArrowLeft } from 'lucide-react';
import AddStaffForm from '@/components/school-admin/AddStaffForm';

export default function AddStaffPage() {
  const [schoolId, setSchoolId] = useState('');
  const [customRoles, setCustomRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const schoolData = await fetchData('get_school_admin_data', { role: 'school_admin' });
        if (!schoolData.school_id) {
          setLoading(false);
          return;
        }
        setSchoolId(schoolData.school_id);
        const rolesRes = await fetch(`/api/schools/custom-roles?school_id=${schoolData.school_id}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        const rolesData = await rolesRes.json();
        setCustomRoles(rolesData.roles || []);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center md:ml-56">
        <div className="animate-pulse text-primary-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen md:ml-56 pt-14 md:pt-6 max-w-lg">
      <Link
        href="/dashboard/school-admin/staff"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-primary-700 mb-4"
      >
        <ArrowLeft size={16} /> Back to staff list
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Add staff</h1>
      <p className="text-sm text-slate-500 mb-6">Create a new staff member. Job roles are managed on the staff list page.</p>
      <AddStaffForm
        schoolId={schoolId}
        customRoles={customRoles}
        onCancel={() => window.history.back()}
      />
    </div>
  );
}
