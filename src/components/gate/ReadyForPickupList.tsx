// @ts-nocheck
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import StudentAvatar from '@/components/shared/StudentAvatar';
import PickupPersonBadge from '@/components/pickup/PickupPersonBadge';
import { formatTimeLagos } from '@/lib/timezone';
import { photoSrc } from '@/lib/photo';
import { toast } from 'sonner';

function queueStudent(item) {
  const s = item?.student;
  if (!s) return null;
  return Array.isArray(s) ? s[0] : s;
}

function matchesSearch(item, query) {
  const s = queueStudent(item);
  if (!s || !query) return true;
  const q = query.toLowerCase();
  return `${s.first_name} ${s.last_name} ${s.student_id_number} ${s.class?.name || ''} ${item.pickup_person_name || ''}`
    .toLowerCase()
    .includes(q);
}

/**
 * Live ready-for-pickup queue — works before dismissal session starts.
 * Teachers mark students ready; gate/admin releases from this list.
 */
export default function ReadyForPickupList({
  schoolId,
  onRelease,
  showReleaseButton = true,
  refreshMs = 15000,
  compact = false,
}) {
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
      if (!compact) toast.error('Could not load ready-for-pickup list');
    }
    setLoading(false);
  }, [schoolId, compact]);

  useEffect(() => {
    if (!schoolId) return undefined;
    setLoading(true);
    load();
    if (!refreshMs) return undefined;
    const interval = setInterval(load, refreshMs);
    return () => clearInterval(interval);
  }, [schoolId, load, refreshMs]);

  const filtered = useMemo(
    () => queue.filter((item) => matchesSearch(item, search.trim())),
    [queue, search]
  );

  if (!schoolId) {
    return <p className="text-sm text-slate-400 text-center py-6">School not loaded</p>;
  }

  return (
    <div className={compact ? '' : 'space-y-2'}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
        <div>
          <h2 className="text-sm font-bold text-slate-800">Ready for Pickup</h2>
          <p className="text-xs text-slate-500">
            {queue.length} waiting · updates live as teachers mark students ready (before dismissal)
          </p>
        </div>
        <button type="button" onClick={load} className="btn-secondary text-xs py-1.5 shrink-0 self-start">
          Refresh
        </button>
      </div>

      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, class, ID, or pickup person…"
          className="input pl-9 min-h-[44px]"
        />
      </div>

      {loading && <p className="text-sm text-slate-400 py-6 text-center">Loading…</p>}

      {!loading && queue.length === 0 && (
        <div className="card text-center py-10 text-slate-400 text-sm">
          No students waiting for pickup yet
        </div>
      )}

      {!loading && queue.length > 0 && filtered.length === 0 && (
        <div className="card text-center py-8 text-slate-400 text-sm">No matches for your search</div>
      )}

      {!loading && filtered.length > 0 && (
        <div className={`space-y-2 ${compact ? 'max-h-[50vh] overflow-y-auto' : 'pb-2'}`}>
          {filtered.map((item) => {
            const s = queueStudent(item);
            if (!s) return null;
            const authorised = item.authorised_pickup_persons || [];
            const matchedPickup =
              authorised.find(
                (p) =>
                  p.name?.trim().toLowerCase() === (item.pickup_person_name || '').trim().toLowerCase()
              ) || authorised[0];
            const pickupPhotoSrc = matchedPickup?.photo_url ? photoSrc(matchedPickup.photo_url) : null;
            return (
              <div key={item.id} className="card-elevated p-3 flex items-center gap-3">
                <StudentAvatar
                  photoUrl={s.photo_url}
                  firstName={s.first_name}
                  lastName={s.last_name}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-base truncate">
                    {s.first_name} {s.last_name}
                  </p>
                  <p className="text-sm font-medium text-primary-700">{s.class?.name || 'No class'}</p>
                  <p className="text-xs text-slate-500 font-mono">{s.student_id_number}</p>
                  <p className="text-xs text-slate-400">Ready {formatTimeLagos(item.created_at)}</p>
                  <div className="flex items-start gap-2 mt-1">
                    {pickupPhotoSrc ? (
                      <img
                        src={pickupPhotoSrc}
                        alt=""
                        className="w-10 h-10 rounded-lg object-cover shrink-0 border border-slate-200"
                      />
                    ) : null}
                    <PickupPersonBadge
                      name={item.pickup_person_name}
                      phone={item.pickup_person_phone}
                      source={item.pickup_source}
                      persons={authorised}
                    />
                  </div>
                </div>
                {showReleaseButton && onRelease && (
                  <button
                    type="button"
                    onClick={() => onRelease(s, item)}
                    className="btn-primary text-xs px-3 py-2 shrink-0"
                  >
                    Release
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
