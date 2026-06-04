// @ts-nocheck
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { formatDateTimeLagos } from '@/lib/timezone';
import { toast } from 'sonner';

export default function PickupRequestsPanel({ schoolId }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/pickup-requests?school_id=${schoolId}`, { credentials: 'include' });
      const data = await res.json();
      setRequests(data.pickup_requests || []);
    } catch {
      toast.error('Could not load pickup requests');
    }
    setLoading(false);
  }, [schoolId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) =>
      `${r.student?.first_name || ''} ${r.student?.last_name || ''} ${r.pickup_person_name || ''} ${r.pickup_person_phone || ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [requests, search]);

  const acknowledge = async (id) => {
    try {
      const res = await fetch('/api/pickup-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, status: 'acknowledged', school_id: schoolId }),
      });
      if (!res.ok) throw new Error();
      toast.success('Acknowledged');
      load();
    } catch {
      toast.error('Failed');
    }
  };

  if (!schoolId) return null;

  return (
    <div className="card">
      <h3 className="font-semibold text-sm mb-3">Pickup requests (today)</h3>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search student or pickup person…"
          className="input pl-9 text-sm min-h-[44px]"
        />
      </div>
      {loading && <p className="text-sm text-gray-400">Loading…</p>}
      {!loading && requests.length === 0 && (
        <p className="text-sm text-gray-400 py-4 text-center">No parent pickup messages today</p>
      )}
      {!loading && requests.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-gray-400 py-4 text-center">No matches for your search</p>
      )}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {filtered.map((r) => (
          <div key={r.id} className="p-3 rounded-xl border border-gray-100 bg-gray-50/80 text-sm">
            <p className="font-semibold">
              {r.student?.first_name} {r.student?.last_name}
            </p>
            <p className="text-gray-700 mt-1">
              Today, <strong>{r.pickup_person_name}</strong> will pick up
              {r.pickup_person_phone && ` · ${r.pickup_person_phone}`}
            </p>
            {r.message && <p className="text-xs text-gray-500 mt-1">{r.message}</p>}
            <p className="text-[10px] text-gray-400 mt-1">{formatDateTimeLagos(r.created_at)}</p>
            {r.status === 'pending' && (
              <button type="button" onClick={() => acknowledge(r.id)} className="btn-secondary text-xs mt-2 py-1.5">
                Acknowledge
              </button>
            )}
            {r.status !== 'pending' && (
              <span className="text-[10px] text-emerald-600 font-semibold uppercase">{r.status}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
