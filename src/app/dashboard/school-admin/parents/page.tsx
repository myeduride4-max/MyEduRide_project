'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, UserCheck, KeyRound, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { SchoolParentRow } from '@/lib/school/school-parents-list';

export default function ParentsListPage() {
  const [parents, setParents] = useState<SchoolParentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const loadParents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/school-admin/parents', {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to load parents');
        return;
      }
      setParents(data.parents || []);
    } catch {
      toast.error('Failed to load parents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadParents();
  }, [loadParents]);

  const filteredParents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return parents;

    return parents.filter((p) => {
      const childText = p.children
        .map((c) => `${c.student_name} ${c.class_name || ''} ${c.student_id_number}`)
        .join(' ');
      return (
        p.name.toLowerCase().includes(q) ||
        (p.phone || '').includes(q) ||
        (p.username || '').toLowerCase().includes(q) ||
        childText.toLowerCase().includes(q)
      );
    });
  }, [parents, searchQuery]);

  const withLogin = parents.filter((p) => p.has_login).length;

  if (loading) {
    return (
      <div className="page-shell flex items-center justify-center">
        <div className="animate-pulse text-primary-600">Loading parents…</div>
      </div>
    );
  }

  return (
    <div className="page-shell max-w-5xl">
      <div className="page-header">
        <div>
          <p className="page-badge">Parents</p>
          <h1 className="page-title">Parent list ({parents.length})</h1>
          <p className="page-subtitle">
            Parent names on file for your students. Manage usernames and passwords on the Passwords page.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0 w-full sm:w-auto">
          <button
            type="button"
            onClick={loadParents}
            className="btn-secondary flex items-center justify-center gap-2 text-sm min-h-[44px]"
          >
            <RefreshCcw size={16} />
            Refresh
          </button>
          <Link
            href="/dashboard/school-admin/passwords"
            className="btn-primary flex items-center justify-center gap-2 text-sm min-h-[44px]"
          >
            <KeyRound size={16} />
            Passwords
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div className="card py-3">
          <p className="text-2xl font-bold">{parents.length}</p>
          <p className="text-xs text-gray-500">Parents on file</p>
        </div>
        <div className="card py-3">
          <p className="text-2xl font-bold">{withLogin}</p>
          <p className="text-xs text-gray-500">With app login</p>
        </div>
        <div className="card py-3 col-span-2 sm:col-span-1">
          <p className="text-2xl font-bold">{parents.length - withLogin}</p>
          <p className="text-xs text-gray-500">No login yet</p>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search parent name, phone, child, class…"
          className="input pl-10 min-h-[44px]"
        />
      </div>

      <div className="card p-0 overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Parent</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Phone</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Login</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Children</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredParents.map((parent) => (
              <tr
                key={
                  parent.id ||
                  (parent.username ? `username:${parent.username}` : `${parent.name}-${parent.phone || ''}`)
                }
                className="hover:bg-gray-50 align-top"
              >
                <td className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center shrink-0 mt-0.5">
                      <UserCheck size={16} className="text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{parent.name}</p>
                      {!parent.has_login && (
                        <p className="text-[11px] text-amber-700 mt-0.5">No app login yet</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{parent.phone || '—'}</td>
                <td className="px-4 py-3">
                  {parent.has_login ? (
                    <span className="text-sm font-mono text-gray-800">@{parent.username}</span>
                  ) : (
                    <Link
                      href="/dashboard/school-admin/passwords"
                      className="text-xs text-primary-600 hover:underline font-medium"
                    >
                      Create on Passwords page
                    </Link>
                  )}
                </td>
                <td className="px-4 py-3">
                  <ul className="space-y-1">
                    {parent.children.map((child) => (
                      <li key={child.student_id} className="text-sm">
                        <span className="font-medium text-gray-900">{child.student_name}</span>
                        {child.class_name && (
                          <span className="text-primary-700 ml-1.5">{child.class_name}</span>
                        )}
                        {child.student_id_number && (
                          <span className="text-gray-400 text-xs ml-1.5 font-mono">
                            {child.student_id_number}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
            {filteredParents.length === 0 && (
              <tr>
                <td colSpan={4} className="py-10 text-center text-gray-400 text-sm">
                  {parents.length === 0
                    ? 'No parents on file yet — parent names are added when you register students'
                    : 'No parents match your search'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
