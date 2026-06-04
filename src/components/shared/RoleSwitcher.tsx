'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { getSession } from '@/lib/api';
import { ChevronDown, Shield, GraduationCap, DoorOpen, Users, User, Check, KeyRound } from 'lucide-react';
import Link from 'next/link';

const ROLE_CONFIG: Record<string, { label: string; href: string; icon: React.ReactNode }> = {
  super_admin: { label: 'Super Admin', href: '/dashboard/super-admin', icon: <Shield size={14} /> },
  school_admin: { label: 'School Admin', href: '/dashboard/school-admin', icon: <GraduationCap size={14} /> },
  teacher: { label: 'Teacher', href: '/dashboard/teacher', icon: <Users size={14} /> },
  gate_officer: { label: 'Gate Officer', href: '/dashboard/gate', icon: <DoorOpen size={14} /> },
  parent: { label: 'Parent', href: '/dashboard/parent', icon: <User size={14} /> },
  staff: { label: 'Staff', href: '/dashboard/staff', icon: <User size={14} /> },
};

type RoleSwitcherProps = {
  /** When false, sign out is not shown in the menu (use a separate logout control). */
  showLogout?: boolean;
  className?: string;
};

export function RoleSwitcher({ showLogout = true, className = '' }: RoleSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [session, setSessionData] = useState<any>(null);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
    const s = getSession();
    setSessionData(s);
    if (!s?.user_id) return;
    if (s.roles?.length) {
      setUserRoles([...new Set(s.roles.map((r: any) => r.role))] as string[]);
    }

    const onSessionUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) setSessionData(detail);
    };
    window.addEventListener('myeduride:session-updated', onSessionUpdated);
    return () => window.removeEventListener('myeduride:session-updated', onSessionUpdated);
  }, []);

  if (!mounted) return <div className={`w-9 h-9 rounded-full bg-gray-200 animate-pulse ${className}`} />;

  const currentRole =
    Object.keys(ROLE_CONFIG).find((r) => pathname.startsWith(ROLE_CONFIG[r].href)) || '';

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 p-1 rounded-full hover:bg-gray-100 transition-colors"
        aria-label="Switch account"
      >
        <div className="w-9 h-9 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
          {session?.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || '?'}
        </div>
        <ChevronDown size={14} className="text-gray-500 hidden sm:block" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border z-50 overflow-hidden">
            <div className="p-3 border-b bg-gray-50">
              <p className="font-medium text-sm text-gray-900">{session?.full_name || 'User'}</p>
              <p className="text-xs text-gray-500 truncate">@{session?.username || session?.email}</p>
            </div>

            {userRoles.length > 0 && (
              <div className="p-2">
                <p className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                  Switch account
                </p>
                {userRoles.map((role) => {
                  const config = ROLE_CONFIG[role];
                  if (!config) return null;
                  return (
                    <Link
                      key={role}
                      href={config.href}
                      onClick={() => setOpen(false)}
                      className={`w-full flex items-center gap-2.5 px-2 py-2.5 rounded-lg text-sm transition-colors ${
                        role === currentRole
                          ? 'bg-primary-50 text-primary-700'
                          : 'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      {config.icon}
                      <span className="flex-1">{config.label}</span>
                      {role === currentRole && <Check size={14} className="text-primary-600" />}
                    </Link>
                  );
                })}
              </div>
            )}

            {userRoles.length === 0 && (
              <p className="p-3 text-xs text-gray-500">No roles assigned</p>
            )}

            <div className="p-2 border-t">
              <Link
                href="/dashboard/account"
                onClick={() => setOpen(false)}
                className="w-full flex items-center gap-2.5 px-2 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                <KeyRound size={14} className="text-gray-400" />
                Account settings
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
