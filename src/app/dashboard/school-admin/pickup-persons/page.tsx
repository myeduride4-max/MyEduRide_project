// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { fetchData } from '@/lib/api';
import PickupPersonsManager from '@/components/pickup/PickupPersonsManager';
import PickupRequestsPanel from '@/components/admin/PickupRequestsPanel';

export default function AdminPickupPersonsPage() {
  const [schoolId, setSchoolId] = useState('');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const schoolData = await fetchData('get_school_admin_data', { role: 'school_admin' });
        if (!schoolData.school_id) return;
        setSchoolId(schoolData.school_id);
        const { students: studs } = await fetchData('get_students', { school_id: schoolData.school_id });
        setStudents(studs || []);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="p-6 flex justify-center"><div className="animate-pulse text-primary-600">Loading…</div></div>;
  }

  return (
    <div className="p-6 pt-14 md:pt-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-1">Pickup management</h1>
      <p className="text-sm text-gray-500 mb-6">
        Authorised pickup persons per child. Parents can add more with photos; you can create or remove entries here.
      </p>
      <div className="card-elevated p-5 mb-6">
        <PickupRequestsPanel schoolId={schoolId} />
      </div>
      <div className="card-elevated p-5">
        <PickupPersonsManager schoolId={schoolId} mode="admin" students={students} />
      </div>
    </div>
  );
}
