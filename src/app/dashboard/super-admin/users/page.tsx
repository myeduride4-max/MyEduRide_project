'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Credentials live on the Passwords page. */
export default function SuperAdminUsersRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/super-admin/passwords');
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
      Redirecting to Passwords…
    </div>
  );
}
