// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { fetchData } from '@/lib/api';
import { formatDateTimeLagos } from '@/lib/timezone';
import { Shield } from 'lucide-react';

export default function AuditLogPage() {
  const [schoolId, setSchoolId] = useState('');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchData('get_school_admin_data', { role: 'school_admin' });
        if (!data.school_id) return;
        setSchoolId(data.school_id);
        const res = await fetch(`/api/school-admin/audit?school_id=${data.school_id}`, {
          credentials: 'include',
        });
        const json = await res.json();
        if (res.ok) setLogs(json.logs || []);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    })();
  }, []);

  const filtered = logs.filter((row) => {
    const q = filter.toLowerCase();
    if (!q) return true;
    const actor = row.actor?.full_name || '';
    return `${row.action} ${actor} ${JSON.stringify(row.details || {})}`.toLowerCase().includes(q);
  });

  if (loading) {
    return (
      <div className="page-shell flex items-center justify-center min-h-[40vh]">
        <div className="animate-pulse text-primary-600">Loading…</div>
      </div>
    );
  }

  return (
    <div className="page-shell max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="text-primary-600" size={28} />
        <div>
          <h1 className="text-2xl font-bold">Audit log</h1>
          <p className="text-sm text-slate-500">
            Logins, password changes, gate actions, promotions, and pickup list changes.
          </p>
        </div>
      </div>

      <input
        className="input mb-4"
        placeholder="Search action, user, or details…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      <div className="card-elevated divide-y">
        {filtered.map((row) => {
          const actor = Array.isArray(row.actor) ? row.actor[0] : row.actor;
          return (
            <div key={row.id} className="p-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold text-slate-900">{row.action.replace(/_/g, ' ')}</span>
                <span className="text-xs text-slate-500">{formatDateTimeLagos(row.created_at)}</span>
              </div>
              <p className="text-xs text-slate-600 mt-1">By {actor?.full_name || 'System'}</p>
              {row.details && Object.keys(row.details).length > 0 && (
                <pre className="text-[10px] text-slate-500 mt-2 overflow-x-auto bg-slate-50 rounded p-2">
                  {JSON.stringify(row.details, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="py-12 text-center text-slate-400">No audit entries yet</p>
        )}
      </div>
    </div>
  );
}
