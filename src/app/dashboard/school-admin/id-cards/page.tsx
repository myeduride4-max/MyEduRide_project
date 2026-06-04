'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** ID cards are super-admin only. */
export default function SchoolAdminIdCardsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/school-admin');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
      ID cards are managed by super admin only.
    </div>
  );
}
