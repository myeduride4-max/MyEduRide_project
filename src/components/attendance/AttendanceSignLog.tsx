// @ts-nocheck
'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, LogOut as LogOutIcon, Search, User } from 'lucide-react';
import { toast } from 'sonner';
import { todayInLagos } from '@/lib/timezone';

export default function AttendanceSignLog({
  schoolId,
  title = 'Sign in / out log',
  defaultEntity = 'all',
  searchable = false,
}) {
  const [date, setDate] = useState(todayInLagos());
  const [entity, setEntity] = useState(defaultEntity);
  const [searchQuery, setSearchQuery] = useState('');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ school_id: schoolId, date, entity });
      const res = await fetch(`/api/attendance/sign-log?${params}`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setEntries(json.entries || []);
    } catch (e) {
      toast.error(e?.message || 'Could not load sign log');
      setEntries([]);
    }
    setLoading(false);
  }, [schoolId, date, entity]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredEntries = searchable && searchQuery.trim()
    ? entries.filter((e) => {
        const q = searchQuery.toLowerCase();
        const hay = `${e.name} ${e.type_label} ${e.detail || ''} ${e.time_display || ''} ${e.pickup_person?.pickup_person_name || ''} ${e.pickup_notice?.pickup_person_name || ''}`.toLowerCase();
        return hay.includes(q);
      })
    : entries;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500">Student check-in/out and staff gate scans (Lagos date)</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Show</label>
          <select className="input" value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="all">Students & staff</option>
            <option value="student">Students only</option>
            <option value="staff">Staff only</option>
          </select>
        </div>
      </div>

      {searchable && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search student name, date, time, or pickup person…"
            className="input pl-9"
          />
        </div>
      )}

      {loading && <p className="text-sm text-slate-500 animate-pulse">Loading…</p>}

      {!loading && (
        <div className="card-elevated divide-y max-h-[70vh] overflow-y-auto">
          {filteredEntries.map((e) => (
            <div key={`${e.entity}-${e.id}`} className="px-4 py-3 flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  e.entity === 'staff' ? 'bg-violet-50' :
                  e.type === 'arrival' || e.type === 'clock_in' ? 'bg-emerald-50' : 'bg-orange-50'
                }`}
              >
                {e.entity === 'staff' ? (
                  <User size={14} className="text-violet-600" />
                ) : e.type === 'arrival' || e.type === 'clock_in' ? (
                  <CheckCircle size={14} className="text-emerald-600" />
                ) : (
                  <LogOutIcon size={14} className="text-orange-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{e.name}</p>
                <p className="text-xs text-slate-500">
                  {e.type_label}
                  {e.detail ? ` · ${e.detail}` : ''}
                </p>
                {(e.pickup_person?.pickup_person_name || e.pickup_notice?.pickup_person_name) && (
                  <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2">
                    <p className="text-[10px] font-bold text-blue-900 uppercase tracking-wide">
                      {e.pickup_person?.pickup_source === 'release'
                        ? 'Released to'
                        : e.pickup_person?.pickup_source === 'request'
                          ? 'Pickup request'
                          : e.pickup_person?.pickup_source === 'authorised'
                            ? 'Authorised pickup'
                            : 'Parent pickup notice'}
                    </p>
                    <p className="text-xs font-bold text-blue-800">
                      {e.pickup_person?.pickup_person_name || e.pickup_notice?.pickup_person_name}
                      {(e.pickup_person?.pickup_person_phone || e.pickup_notice?.pickup_person_phone)
                        ? ` · ${e.pickup_person?.pickup_person_phone || e.pickup_notice?.pickup_person_phone}`
                        : ''}
                    </p>
                    {e.pickup_notice?.notes?.trim() && (
                      <p className="text-xs text-blue-700 mt-0.5">{e.pickup_notice.notes.trim()}</p>
                    )}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-mono font-medium">{e.time_display}</p>
                {e.status === 'late' && (
                  <span className="text-[10px] text-amber-700 font-semibold">Late</span>
                )}
              </div>
            </div>
          ))}
          {filteredEntries.length === 0 && (
            <p className="py-12 text-center text-slate-400 text-sm">
              {entries.length === 0 ? 'No sign-ins for this date' : 'No matches for your search'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
