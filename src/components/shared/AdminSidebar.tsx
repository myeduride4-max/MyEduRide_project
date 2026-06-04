'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, GraduationCap, ClipboardList, Settings,
  DoorOpen, BarChart3, School, Menu, X, LogOut, Car, Bell, Calendar, ScanLine,
  ChevronDown, ChevronRight, Plus, List, Shield, KeyRound, UserCheck, User,
} from 'lucide-react';
import { logout } from '@/lib/api';

const LOGO_URL = 'https://www.image2url.com/r2/default/images/1779230378321-292c7b74-6217-41ff-832a-180a535ea4cb.png';

interface NavLink {
  label: string;
  href: string;
  icon?: React.ReactNode;
}

interface NavGroup {
  label: string;
  icon: React.ReactNode;
  items: NavLink[];
}

const topLinks: NavLink[] = [
  { label: 'Dashboard', href: '/dashboard/school-admin', icon: <LayoutDashboard size={18} /> },
];

const navGroups: NavGroup[] = [
  {
    label: 'Students',
    icon: <Users size={18} />,
    items: [
      { label: 'Student list', href: '/dashboard/school-admin/students', icon: <List size={16} /> },
      { label: 'Add student', href: '/dashboard/school-admin/students/new', icon: <Plus size={16} /> },
    ],
  },
  {
    label: 'Staff',
    icon: <GraduationCap size={18} />,
    items: [
      { label: 'Staff list', href: '/dashboard/school-admin/staff', icon: <List size={16} /> },
      { label: 'Add staff', href: '/dashboard/school-admin/staff/new', icon: <Plus size={16} /> },
    ],
  },
  {
    label: 'Parents',
    icon: <UserCheck size={18} />,
    items: [
      { label: 'Parent list', href: '/dashboard/school-admin/parents', icon: <List size={16} /> },
    ],
  },
  {
    label: 'Reports',
    icon: <BarChart3 size={18} />,
    items: [
      { label: 'Attendance report', href: '/dashboard/school-admin/reports', icon: <ClipboardList size={16} /> },
      { label: 'Gate activities', href: '/dashboard/school-admin/reports/gate-activities', icon: <DoorOpen size={16} /> },
    ],
  },
];

const bottomLinks: NavLink[] = [
  { label: 'Passwords', href: '/dashboard/school-admin/passwords', icon: <KeyRound size={18} /> },
  { label: 'Classes', href: '/dashboard/school-admin/classes', icon: <School size={18} /> },
  { label: 'Pickup list', href: '/dashboard/school-admin/pickup-persons', icon: <Car size={18} /> },
  { label: 'Notifications', href: '/dashboard/school-admin/notifications', icon: <Bell size={18} /> },
  { label: 'Attendance', href: '/dashboard/school-admin/attendance', icon: <ClipboardList size={18} /> },
  { label: 'School calendar', href: '/dashboard/school-admin/calendar', icon: <Calendar size={18} /> },
  { label: 'Student & staff scan', href: '/dashboard/school-admin/staff-attendance', icon: <ScanLine size={18} /> },
  { label: 'Audit log', href: '/dashboard/school-admin/audit', icon: <Shield size={18} /> },
  { label: 'Account', href: '/dashboard/account', icon: <User size={18} /> },
  { label: 'Settings', href: '/dashboard/school-admin/settings', icon: <Settings size={18} /> },
];

function pathMatches(pathname: string, href: string) {
  const base = href.split('?')[0];
  if (base === '/dashboard/school-admin') return pathname === base;
  if (base === '/dashboard/school-admin/staff') return pathname === base;
  if (base === '/dashboard/school-admin/students') return pathname === base;
  if (base === '/dashboard/school-admin/parents') return pathname === base;
  return pathname === base || pathname.startsWith(`${base}/`);
}

function groupIsActive(pathname: string, group: NavGroup) {
  return group.items.some((item) => pathMatches(pathname, item.href));
}

export function AdminSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({
    Students: true,
    Staff: false,
    Parents: false,
    Reports: pathname?.includes('/reports') ?? false,
  }));

  const toggleGroup = (label: string) => {
    setExpanded((p) => ({ ...p, [label]: !p[label] }));
  };

  const renderLink = (item: NavLink, nested = false) => {
    const isActive = pathMatches(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all ${
          nested ? 'pl-9' : ''
        } ${
          isActive
            ? 'bg-primary-50 text-primary-700 shadow-sm'
            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
        }`}
      >
        {item.icon && (
          <span className={isActive ? 'text-primary-600' : 'text-gray-400'}>{item.icon}</span>
        )}
        {item.label}
      </Link>
    );
  };

  const navContent = (
    <>
      <div className="p-5">
        <Link href="/dashboard/school-admin" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
          <img src={LOGO_URL} alt="MyEduRide" className="h-8" />
          <span className="font-bold text-primary-700 text-sm">MyEduRide</span>
        </Link>
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {topLinks.map((item) => renderLink(item))}

        {navGroups.map((group) => {
          const open = expanded[group.label] ?? groupIsActive(pathname, group);
          const active = groupIsActive(pathname, group);
          return (
            <div key={group.label} className="pt-1">
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium w-full transition-all ${
                  active ? 'text-primary-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                }`}
              >
                <span className={active ? 'text-primary-600' : 'text-gray-400'}>{group.icon}</span>
                <span className="flex-1 text-left">{group.label}</span>
                {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
              </button>
              {open && <div className="space-y-0.5 mt-0.5">{group.items.map((item) => renderLink(item, true))}</div>}
            </div>
          );
        })}

        <div className="pt-2 border-t border-gray-100 mt-2 space-y-1">
          {bottomLinks.map((item) => renderLink(item))}
        </div>
      </nav>

      <div className="p-3 border-t">
        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 w-full transition-all min-h-[44px]"
        >
          <LogOut size={18} className="text-gray-400" />
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-30 p-3 rounded-xl bg-white shadow-md border md:hidden min-h-[44px] min-w-[44px]"
        aria-label="Open menu"
      >
        <Menu size={20} className="text-gray-700" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white flex flex-col shadow-2xl rounded-r-2xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px]"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
            {navContent}
          </aside>
        </div>
      )}

      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-56 bg-white border-r border-gray-100 flex-col z-20">
        {navContent}
      </aside>
    </>
  );
}
