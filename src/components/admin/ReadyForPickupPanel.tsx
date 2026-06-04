// @ts-nocheck
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import StudentAvatar from '@/components/shared/StudentAvatar';
import PickupPersonBadge from '@/components/pickup/PickupPersonBadge';
import { formatTimeLagos } from '@/lib/timezone';
import { toast } from 'sonner';

function matchesPickupSearch(item, query) {
  const s = item?.student;
  if (!s || !query) return true;
  const q = query.toLowerCase();
  return `${s.first_name} ${s.last_name} ${s.student_id_number} ${s.class?.name || ''} ${item.pickup_person_name || ''}`
    .toLowerCase()
    .includes(q);
}

function queueStudent(item) {
  const s = item?.student;
  if (!s) return null;
  return Array.isArray(s) ? s[0] : s;
}

export default function ReadyForPickupPanel({ schoolId, compact = false, refreshMs = 60000 }) {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!schoolId) return;
    try {
      const res = await fetch(`/api/gate/dashboard?school_id=${schoolId}&t=${Date.now()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setQueue(data.pickup_queue || []);
    } catch {
      toast.error('Could not load ready-for-pickup list');
    }
    setLoading(false);
  }, [schoolId]);

  useEffect(() => {
    setLoading(true);
    load();
    if (!refreshMs) return undefined;
    const interval = setInterval(load, refreshMs);
    return () => clearInterval(interval);
  }, [load, refreshMs]);

  const filtered = useMemo(
    () => queue.filter((item) => matchesPickupSearch(item, search.trim())),
    [queue, search]
  );

  if (!schoolId) return null;

  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div>
          <h3 className="font-semibold text-sm">Ready for pickup</h3>
          <p className="text-xs text-gray-500">
            {queue.length} waiting · teachers marked these students for gate release
          </p>
        </div>
        {!compact && (
          <button type="button" onClick={load} className="btn-secondary text-xs py-1.5 shrink-0">
            Refresh
          </button>
        )}
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, class, or student ID…"
          className="input pl-9 text-sm min-h-[44px]"
        />
      </div>

      {loading && <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>}

      {!loading && queue.length === 0 && (
        <p className="text-sm text-gray-400 py-6 text-center">No students waiting for pickup</p>
      )}

      {!loading && queue.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-gray-400 py-6 text-center">No matches for your search</p>
      )}

      {!loading && filtered.length > 0 && (
        <div className={`space-y-2 overflow-y-auto ${compact ? 'max-h-64' : 'max-h-96'}`}>
          {filtered.map((item) => {
            const s = queueStudent(item);
            if (!s) return null;
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/80"
              >
                <StudentAvatar
                  photoUrl={s.photo_url}
                  firstName={s.first_name}
                  lastName={s.last_name}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {s.first_name} {s.last_name}
                  </p>
                  <p className="text-xs text-primary-700 font-medium">{s.class?.name || 'No class'}</p>
                  <p className="text-[10px] text-gray-500 font-mono">{s.student_id_number}</p>
                  <p className="text-[10px] text-gray-400">Ready {formatTimeLagos(item.created_at)}</p>
                  <PickupPersonBadge
                    name={item.pickup_person_name}
                    phone={item.pickup_person_phone}
                    source={item.pickup_source}
                    persons={item.authorised_pickup_persons || []}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
