// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/api';
import { Shield, GraduationCap, Users, DoorOpen, User, ArrowRight } from 'lucide-react';

const LOGO_URL = 'https://www.image2url.com/r2/default/images/1779230378321-292c7b74-6217-41ff-832a-180a535ea4cb.png';

const ROLE_CONFIG = {
  super_admin: { label: 'Super Admin', desc: 'Manage all schools, students, and platform settings', href: '/dashboard/super-admin', icon: <Shield size={22} />, gradient: 'from-purple-500 to-indigo-600' },
  school_admin: { label: 'School Admin', desc: 'Manage your school, students, teachers, and reports', href: '/dashboard/school-admin', icon: <GraduationCap size={22} />, gradient: 'from-blue-500 to-cyan-600' },
  teacher: { label: 'Teacher', desc: 'View class attendance and manage student dismissals', href: '/dashboard/teacher', icon: <Users size={22} />, gradient: 'from-green-500 to-emerald-600' },
  gate_officer: { label: 'Gate Officer', desc: 'Scan and verify students at the school gate', href: '/dashboard/gate', icon: <DoorOpen size={22} />, gradient: 'from-orange-500 to-amber-600' },
  parent: { label: 'Parent', desc: 'View your children attendance and notifications', href: '/dashboard/parent', icon: <User size={22} />, gradient: 'from-pink-500 to-rose-600' },
  staff: { label: 'Staff', desc: 'View your sign-in history and attendance', href: '/dashboard/staff', icon: <User size={22} />, gradient: 'from-slate-500 to-slate-700' },
};

export default function DashboardRouter() {
  const [roles, setRoles] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [userName, setUserName] = useState('');
  const router = useRouter();

  const [schoolWelcome, setSchoolWelcome] = useState('');

  useEffect(() => {
    setMounted(true);
    const session = getSession();
    if (!session?.user_id) { router.push('/auth/login'); return; }
    setUserName(session.full_name || '');
    const ps = session.primary_school;
    if (ps?.name) {
      setSchoolWelcome(ps.welcome_message || `Welcome to ${ps.name}`);
    }

    const userRoles = [...new Set((session.roles || []).map((r: any) => r.role))] as string[];
    
    if (userRoles.length === 0) {
      router.push('/dashboard/super-admin');
      return;
    }

    // Always show picker
    setRoles(userRoles);
  }, []);

  if (!mounted || roles.length === 0) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-primary-600">Loading...</div></div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Logo + greeting */}
        <div className="text-center mb-8">
          <img src={LOGO_URL} alt="MyEduRide" className="h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">Welcome back, {userName.split(' ')[0]}</h1>
          {schoolWelcome ? (
            <p className="text-primary-700 font-medium mt-1">{schoolWelcome}</p>
          ) : null}
          <p className="text-gray-500 mt-1">Choose how you want to continue</p>
        </div>

        {/* Role cards */}
        <div className="space-y-3">
          {roles.map((role) => {
            const config = ROLE_CONFIG[role];
            if (!config) return null;
            return (
              <button key={role} onClick={() => router.push(config.href)}
                className="w-full flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-primary-200 transition-all text-left group">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center text-white shadow-sm`}>
                  {config.icon}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{config.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{config.desc}</p>
                </div>
                <ArrowRight size={16} className="text-gray-300 group-hover:text-primary-500 transition-colors" />
              </button>
            );
          })}
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">MyEduRide — The Student Safety Platform</p>
      </div>
    </div>
  );
}
