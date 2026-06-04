// @ts-nocheck
'use client';

import { useState } from 'react';
import { Download, Calendar, Database } from 'lucide-react';
import { toast } from 'sonner';
import { ATTENDANCE_UI_NOTE } from '@/lib/attendance/window';

export default function AttendanceReportPanel({
  schoolId = '',
  showSchoolPicker = false,
  schools = [],
}) {
  const [selectedSchool, setSelectedSchool] = useState(schoolId || '');
  const [day, setDay] = useState(new Date().toISOString().split('T')[0]);
  const [downloading, setDownloading] = useState(null);

  const activeSchool = showSchoolPicker ? selectedSchool : schoolId;

  const download = async (scope) => {
    if (showSchoolPicker && !activeSchool) {
      toast.error('Select a school first');
      return;
    }
    setDownloading(scope);
    try {
      const params = new URLSearchParams({ scope });
      if (activeSchool) params.set('school_id', activeSchool);
      if (scope === 'day') params.set('day', day);

      const res = await fetch(`/api/attendance/export?${params}`, { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disp = res.headers.get('Content-Disposition');
      const match = disp?.match(/filename="(.+)"/);
      a.download = match?.[1] || `attendance_${scope}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(scope === 'all' ? 'Full history downloaded' : `Downloaded ${day}`);
    } catch (e) {
      toast.error(e.message || 'Download failed');
    }
    setDownloading(null);
  };

  return (
    <div className="space-y-4">
      <div className="alert-info text-sm leading-relaxed">{ATTENDANCE_UI_NOTE}</div>

      {showSchoolPicker && (
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">School</label>
          <select
            className="input"
            value={selectedSchool}
            onChange={(e) => setSelectedSchool(e.target.value)}
          >
            <option value="">Select school…</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Report day</label>
        <input type="date" className="input" value={day} onChange={(e) => setDay(e.target.value)} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={() => download('day')}
          disabled={!!downloading}
          className="btn-primary flex-1 flex items-center justify-center gap-2 py-3"
        >
          <Calendar size={18} />
          {downloading === 'day' ? 'Exporting…' : 'Download this day (CSV)'}
        </button>
        <button
          type="button"
          onClick={() => download('all')}
          disabled={!!downloading}
          className="btn-secondary flex-1 flex items-center justify-center gap-2 py-3"
        >
          <Database size={18} />
          {downloading === 'all' ? 'Exporting…' : 'Download all history (CSV)'}
        </button>
      </div>

      <p className="text-xs text-slate-400">
        Daily files use calendar midnight–midnight. Live dashboards reset Present/In 12 hours after each scan.
      </p>
    </div>
  );
}
