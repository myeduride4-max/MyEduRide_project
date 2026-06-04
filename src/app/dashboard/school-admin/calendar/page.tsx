// @ts-nocheck
'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchData } from '@/lib/api';
import { Calendar, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { todayInLagos } from '@/lib/timezone';

const DAY_TYPES = [
  { value: 'public_holiday', label: 'Public holiday' },
  { value: 'school_event', label: 'School event' },
  { value: 'closure', label: 'Closure' },
];

function formatRange(start, end) {
  if (!start) return '';
  if (!end || start === end) return start;
  return `${start} → ${end}`;
}

export default function SchoolCalendarPage() {
  const [schoolId, setSchoolId] = useState('');
  const [events, setEvents] = useState([]);
  const [gateOverrides, setGateOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [overrideForm, setOverrideForm] = useState({ override_date: todayInLagos(), reason: '' });
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [form, setForm] = useState({
    start_date: todayInLagos(),
    end_date: todayInLagos(),
    day_type: 'public_holiday',
    title: '',
    description: '',
    notify_parents: false,
  });

  const loadEvents = useCallback(async (sid) => {
    if (!sid) return;
    const res = await fetch(`/api/schools/calendar?school_id=${sid}`, { credentials: 'include' });
    const json = await res.json();
    if (json.migration_required) {
      toast.error('Run supabase/schema.sql in Supabase SQL Editor');
      setEvents([]);
      return;
    }
    if (!res.ok) throw new Error(json.error);
    setEvents(json.events || []);
    setGateOverrides(json.gate_overrides || []);
  }, []);

  const addGateOverride = async (e) => {
    e.preventDefault();
    if (!overrideForm.reason.trim()) {
      toast.error('Reason required (e.g. Saturday exam)');
      return;
    }
    setOverrideSaving(true);
    try {
      const res = await fetch('/api/schools/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'gate_override',
          school_id: schoolId,
          override_date: overrideForm.override_date,
          reason: overrideForm.reason.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success('Gate open override saved — logged in audit');
      setOverrideForm((f) => ({ ...f, reason: '' }));
      await loadEvents(schoolId);
    } catch (err) {
      toast.error(err.message || 'Failed');
    }
    setOverrideSaving(false);
  };

  const removeOverride = async (ov) => {
    if (!confirm(`Remove gate override for ${ov.override_date}?`)) return;
    const res = await fetch('/api/schools/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        action: 'delete_gate_override',
        school_id: schoolId,
        id: ov.id,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || 'Failed');
      return;
    }
    toast.success('Override removed');
    await loadEvents(schoolId);
  };

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchData('get_school_admin_data', { role: 'school_admin' });
        setSchoolId(data.school_id || '');
        if (data.school_id) await loadEvents(data.school_id);
      } catch (e) {
        toast.error('Could not load calendar');
      }
      setLoading(false);
    })();
  }, [loadEvents]);

  const addRange = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error('Title required');
      return;
    }
    if (form.end_date < form.start_date) {
      toast.error('End date must be on or after start date');
      return;
    }
    try {
      const res = await fetch('/api/schools/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          school_id: schoolId,
          start_date: form.start_date,
          end_date: form.end_date,
          day_type: form.day_type,
          title: form.title,
          description: form.description,
          notify_parents: form.notify_parents,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const n = json.days_created || 1;
      toast.success(
        n === 1
          ? 'Day saved — excluded from reports'
          : `${n} days highlighted (${json.start_date} to ${json.end_date})`
      );
      setForm((f) => ({ ...f, title: '', description: '' }));
      await loadEvents(schoolId);
    } catch (err) {
      toast.error(err.message || 'Failed');
    }
  };

  const removeEvent = async (ev) => {
    if (!confirm(`Remove "${ev.title}"${ev.day_count > 1 ? ` (${ev.day_count} days)` : ''}?`)) return;
    const params = new URLSearchParams({ school_id: schoolId });
    if (ev.batch_id) params.set('batch_id', ev.batch_id);
    else params.set('id', ev.id);

    const res = await fetch(`/api/schools/calendar?${params}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || 'Failed');
      return;
    }
    toast.success('Removed');
    await loadEvents(schoolId);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center md:ml-56">
        <div className="animate-pulse text-primary-600">Loading…</div>
      </div>
    );
  }

  return (
    <div className="page-shell max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Calendar className="text-primary-600" size={28} />
        <div>
          <h1 className="text-2xl font-bold">School calendar</h1>
          <p className="text-sm text-slate-500">
            Holidays and closures block gate check-in/out and pickup. Weekends are always non-school. Use a gate override below for occasional Saturday events.
          </p>
        </div>
      </div>

      <form onSubmit={addRange} className="card-elevated p-5 space-y-3 mb-6">
        <h2 className="font-semibold text-sm">Add holiday, event, or closure</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Start date</label>
            <input
              type="date"
              className="input"
              value={form.start_date}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => ({
                  ...f,
                  start_date: v,
                  end_date: f.end_date < v ? v : f.end_date,
                }));
              }}
              required
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">End date</label>
            <input
              type="date"
              className="input"
              value={form.end_date}
              min={form.start_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              required
            />
          </div>
        </div>
        <p className="text-[11px] text-slate-400">
          Same start and end = single weekday. Weekends in a range are skipped automatically.
        </p>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Type</label>
          <select
            className="input"
            value={form.day_type}
            onChange={(e) => setForm({ ...form, day_type: e.target.value })}
          >
            {DAY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Title</label>
          <input
            className="input"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Easter break"
            required
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Notes (optional)</label>
          <textarea
            className="input min-h-[72px]"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <button type="submit" className="btn-primary w-full">Save date range</button>
      </form>

      <form onSubmit={addGateOverride} className="card-elevated p-5 space-y-3 mb-6 border border-amber-100 bg-amber-50/40">
        <h2 className="font-semibold text-sm">Gate open override (HR / admin)</h2>
        <p className="text-xs text-slate-500">
          Opens the gate on a weekend or holiday for a special event. All overrides are audit-logged.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Date</label>
            <input
              type="date"
              className="input"
              value={overrideForm.override_date}
              onChange={(e) => setOverrideForm((f) => ({ ...f, override_date: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Reason *</label>
            <input
              className="input"
              value={overrideForm.reason}
              onChange={(e) => setOverrideForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. Saturday exam"
              required
            />
          </div>
        </div>
        <button type="submit" disabled={overrideSaving} className="btn-primary w-full">
          {overrideSaving ? 'Saving…' : 'Allow gate on this date'}
        </button>
        {gateOverrides.length > 0 && (
          <ul className="divide-y border border-slate-200 rounded-lg bg-white mt-2">
            {gateOverrides.map((ov) => (
              <li key={ov.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <span>
                  <strong>{ov.override_date}</strong> — {ov.reason}
                </span>
                <button type="button" onClick={() => removeOverride(ov)} className="text-red-600 text-xs font-semibold">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      <div className="card-elevated divide-y">
        {events.map((ev) => (
          <div key={ev.batch_id || ev.id} className="p-4 flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{ev.title}</p>
              <p className="text-xs text-slate-500">
                {formatRange(ev.start_date, ev.end_date)}
                {ev.day_count > 1 && ` · ${ev.day_count} days`}
                {' · '}
                {String(ev.day_type).replace('_', ' ')}
              </p>
              {ev.description && <p className="text-sm text-slate-600 mt-1">{ev.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => removeEvent(ev)}
              className="p-2 text-red-500 hover:bg-red-50 rounded-lg shrink-0"
              aria-label="Delete"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {events.length === 0 && (
          <p className="py-10 text-center text-slate-400 text-sm">No holidays or events yet</p>
        )}
      </div>
    </div>
  );
}
