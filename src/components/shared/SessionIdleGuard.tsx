'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { getSession, logout } from '@/lib/api';
import { toast } from 'sonner';

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;

function idleMsForPath(pathname: string | null): number | null {
  if (!pathname?.startsWith('/dashboard')) return null;
  if (pathname.startsWith('/dashboard/gate')) return 15 * 60 * 1000;
  if (pathname.startsWith('/dashboard/school-admin')) return 30 * 60 * 1000;
  if (pathname.startsWith('/dashboard/super-admin')) return 30 * 60 * 1000;
  return 30 * 60 * 1000;
}

/** Logs out after inactivity (gate 15 min, admin 30 min). */
export function SessionIdleGuard() {
  const pathname = usePathname();
  const lastActive = useRef(Date.now());

  useEffect(() => {
    const limit = idleMsForPath(pathname);
    if (!limit || !getSession()) return;

    const bump = () => {
      lastActive.current = Date.now();
    };

    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, bump, { passive: true });
    }

    const tick = setInterval(() => {
      if (!getSession()) return;
      if (Date.now() - lastActive.current >= limit) {
        toast.info('Signed out after inactivity');
        logout();
      }
    }, 60_000);

    return () => {
      clearInterval(tick);
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, bump);
      }
    };
  }, [pathname]);

  return null;
}
