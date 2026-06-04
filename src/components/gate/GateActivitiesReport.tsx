// @ts-nocheck
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { todayInLagos } from '@/lib/timezone';

/**
 * Gate activities from Supabase gate_activity_logs (written on each gate action).
 */
export default function GateActivitiesReport({ schoolId, title = 'Gate activities' }) {
  const [date, setDate] = useState(todayInLagos());
  const [searchQuery, setSearchQuery] = useState('');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [migrationRequired, setMigrationRequired] = useState(false);

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ school_id: schoolId, date });
      const res = await fetch(`/api/gate/activity-log?${params}`, { credentials: 'include' });
      const json = await res.json();
      if (json.migration_required) {
        setMigrationRequired(true);
        setEntries([]);
        return;
      }
      if (!res.ok) throw new Error(json.error || 'Failed');
      setMigrationRequired(false);
      setEntries(json.entries || []);
    } catch (e) {
      toast.error(e?.message || 'Could not load gate activities');
      setEntries([]);
    }
    setLoading(false);
  }, [schoolId, date]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = entries.filter((e) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const hay = `${e.student_name} ${e.class_name} ${e.student_id_number} ${e.action_label} ${e.pickup_person_name || ''} ${e.gate_officer_name} ${e.time_display} ${date}`.toLowerCase();
    return hay.includes(q);
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500">
          From <code className="text-[10px] bg-slate-100 px-1 rounded">gate_activity_logs</code> — releases, check-ins, staff scans, overrides.
        </p>
      </div>

      {migrationRequired && (
        <div className="alert-info text-sm">
          Run <strong>supabase/schema.sql</strong> in Supabase SQL Editor to create gate activity logs.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Date</label>
          <input type="date" className="input min-h-[44px]" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Student, officer, pickup, time…"
              className="input pl-9 min-h-[44px]"
            />
          </div>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500 animate-pulse">Loading…</p>}

      {!loading && (
        <div className="card-elevated divide-y max-h-[70vh] overflow-y-auto">
          {filtered.map((e) => (
            <div key={e.id} className="px-4 py-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-slate-900">{e.student_name}</p>
                  {(e.class_name || e.student_id_number) && (
                    <p className="text-sm text-primary-700 font-medium">
                      {e.class_name}
                      {e.student_id_number ? ` · ${e.student_id_number}` : ''}
                    </p>
                  )}
                  <p className="text-sm text-slate-600 mt-0.5">{e.action_label}</p>
                  {e.pickup_person_name && (
                    <p className="text-sm text-blue-800 mt-1">
                      Received by: <strong>{e.pickup_person_name}</strong>
                      {e.pickup_person_phone ? ` · ${e.pickup_person_phone}` : ''}
                    </p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">Officer: {e.gate_officer_name}</p>
                </div>
                <p className="text-sm font-mono font-semibold text-slate-700 shrink-0">{e.time_display}</p>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="py-12 text-center text-slate-400 text-sm">
              {entries.length === 0
                ? 'No gate activity for this date (actions appear after the next check-in/release)'
                : 'No matches for your search'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
