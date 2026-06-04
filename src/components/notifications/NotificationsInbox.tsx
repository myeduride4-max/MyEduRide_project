// @ts-nocheck
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTimeLagos } from '@/lib/timezone';

export default function NotificationsInbox({ schoolId, compact = false }) {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ school_id: schoolId, limit: '80' });
      const res = await fetch(`/api/notifications/inbox?${params}`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setItems(json.notifications || []);
      setUnread(json.unread_count || 0);
    } catch (e) {
      toast.error(e.message || 'Could not load notifications');
    }
    setLoading(false);
  }, [schoolId]);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id) => {
    await fetch('/api/notifications/inbox', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id }),
    });
    load();
  };

  const markAllRead = async () => {
    await fetch('/api/notifications/inbox', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ mark_all: true, school_id: schoolId }),
    });
    load();
  };

  const typeColor = (type) => {
    if (type === 'pickup_request' || type === 'pickup_person') return 'bg-blue-50 text-blue-800';
    if (type === 'late') return 'bg-amber-50 text-amber-800';
    if (type === 'dismissal') return 'bg-orange-50 text-orange-800';
    if (type === 'arrival') return 'bg-emerald-50 text-emerald-800';
    return 'bg-slate-50 text-slate-700';
  };

  return (
    <div className={compact ? '' : 'space-y-4'}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bell size={20} className="text-primary-600" />
          <h2 className="font-bold text-slate-900">Notifications</h2>
          {unread > 0 && (
            <span className="text-xs font-bold bg-red-500 text-white px-2 py-0.5 rounded-full">{unread}</span>
          )}
        </div>
        {unread > 0 && (
          <button type="button" onClick={markAllRead} className="text-xs text-primary-600 flex items-center gap-1">
            <CheckCheck size={14} /> Mark all read
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500">Pickup requests, registrations, attendance, and dismissals</p>

      {loading && <p className="text-sm text-slate-400 animate-pulse">Loading…</p>}

      {!loading && items.length === 0 && (
        <div className="card text-center py-10 text-slate-400 text-sm">No notifications yet</div>
      )}

      <div className="space-y-2 max-h-[70vh] overflow-y-auto">
        {items.map((n) => {
          const st = n.student;
          const student = Array.isArray(st) ? st[0] : st;
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => !n.is_read && markRead(n.id)}
              className={`w-full text-left card p-3 transition ${!n.is_read ? 'border-l-4 border-l-primary-500 bg-primary-50/30' : ''}`}
            >
              <div className="flex justify-between gap-2 items-start">
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${typeColor(n.type)}`}>
                  {(n.type || 'system').replace('_', ' ')}
                </span>
                <span className="text-[10px] text-slate-400 shrink-0">{formatDateTimeLagos(n.created_at)}</span>
              </div>
              <p className="font-semibold text-sm text-slate-900 mt-1">{n.title}</p>
              <p className="text-xs text-slate-600 mt-0.5">{n.message}</p>
              {student && (
                <p className="text-[10px] text-slate-500 mt-1">
                  {student.first_name} {student.last_name}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
