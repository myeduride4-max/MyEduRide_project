'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        router.push('/dashboard');
      } else {
        router.push('/auth/login');
      }
    };

    checkSession();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-primary-600 text-xl font-medium">
        Loading MyEduRide...
      </div>
    </div>
  );
}
