'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Building2, CreditCard, ClipboardList, KeyRound, User } from 'lucide-react';
import { RouteGuard } from '@/components/shared/RouteGuard';

const LOGO_URL = 'https://www.image2url.com/r2/default/images/1779230378321-292c7b74-6217-41ff-832a-180a535ea4cb.png';

const navItems = [
  { label: 'Dashboard', href: '/dashboard/super-admin', icon: <LayoutDashboard size={18} /> },
  { label: 'Schools', href: '/dashboard/super-admin/schools', icon: <Building2 size={18} /> },
  { label: 'Passwords', href: '/dashboard/super-admin/passwords', icon: <KeyRound size={18} /> },
  { label: 'ID Cards', href: '/dashboard/super-admin/id-cards', icon: <CreditCard size={18} /> },
  { label: 'Reports', href: '/dashboard/super-admin/reports', icon: <ClipboardList size={18} /> },
  { label: 'Account', href: '/dashboard/account', icon: <User size={18} /> },
];

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <RouteGuard requiredRole="super_admin">
      <div className="flex min-h-screen">
        <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-56 bg-white border-r border-gray-100 flex-col z-20">
          <div className="p-5">
            <Link href="/dashboard/super-admin" className="flex items-center gap-2.5">
              <img src={LOGO_URL} alt="MyEduRide" className="h-8" />
              <div>
                <p className="font-bold text-primary-700 text-sm">MyEduRide</p>
                <p className="text-[10px] text-gray-400">Super Admin</p>
              </div>
            </Link>
          </div>
          <nav className="flex-1 px-3 space-y-1">
            {navItems.map(item => {
              const isActive = pathname === item.href || (item.href !== '/dashboard/super-admin' && pathname.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all ${
                    isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                  }`}>
                  <span className={isActive ? 'text-primary-600' : 'text-gray-400'}>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="flex-1 md:ml-56 min-h-screen overflow-y-auto">{children}</main>
      </div>
    </RouteGuard>
  );
}
