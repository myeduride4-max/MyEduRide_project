// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { fetchData } from '@/lib/api';
import { ScanLine, Car } from 'lucide-react';
import StudentIdScanPanel from '@/components/gate/StudentIdScanPanel';
import StaffIdScanPanel from '@/components/gate/StaffIdScanPanel';
import ReadyForPickupList from '@/components/gate/ReadyForPickupList';
import AttendanceSignLog from '@/components/attendance/AttendanceSignLog';

export default function StudentStaffScanPage() {
  const [schoolId, setSchoolId] = useState('');
  const [scanKind, setScanKind] = useState('student');
  const [mode, setMode] = useState('arrival');
  const [loading, setLoading] = useState(true);
  const [logKey, setLogKey] = useState(0);
  const [releaseStudent, setReleaseStudent] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchData('get_school_admin_data', { role: 'school_admin' });
        setSchoolId(data.school_id || '');
      } catch {
        /* ignore */
      }
      setLoading(false);
    })();
  }, []);

  const handleReleaseFromQueue = (student) => {
    setReleaseStudent(student);
    setScanKind('student');
    setMode('departure');
  };

  const handleScanSuccess = () => {
    setReleaseStudent(null);
    setLogKey((k) => k + 1);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center md:ml-56">
        <div className="animate-pulse text-primary-600">Loading…</div>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen md:ml-56 pt-14 md:pt-6 max-w-lg">
      <div className="flex items-center gap-3 mb-2">
        <ScanLine className="text-primary-600" size={26} />
        <h1 className="text-2xl font-bold">Student &amp; staff scan</h1>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Scan on behalf of the gate manager. Ready-for-pickup list is live all day — use it before switching to check-out.
      </p>

      <div className="pill-tabs mb-3">
        <button
          type="button"
          onClick={() => {
            setScanKind('student');
            setReleaseStudent(null);
          }}
          className={scanKind === 'student' ? 'pill-tab-active' : 'pill-tab-inactive'}
        >
          Student scan
        </button>
        <button
          type="button"
          onClick={() => {
            setScanKind('staff');
            setReleaseStudent(null);
          }}
          className={scanKind === 'staff' ? 'pill-tab-active' : 'pill-tab-inactive'}
        >
          Staff scan
        </button>
        <button
          type="button"
          onClick={() => setScanKind('ready')}
          className={scanKind === 'ready' ? 'pill-tab-active' : 'pill-tab-inactive'}
        >
          <Car size={14} className="inline mr-1" />
          Ready for pickup
        </button>
      </div>

      {scanKind === 'ready' ? (
        <ReadyForPickupList
          schoolId={schoolId}
          onRelease={handleReleaseFromQueue}
          showReleaseButton
        />
      ) : (
        <>
          <div className="pill-tabs mb-4">
            <button
              type="button"
              onClick={() => setMode('arrival')}
              className={mode === 'arrival' ? 'pill-tab-active' : 'pill-tab-inactive'}
            >
              {scanKind === 'student' ? 'Check in' : 'Sign in'}
            </button>
            <button
              type="button"
              onClick={() => setMode('departure')}
              className={mode === 'departure' ? 'pill-tab-active' : 'pill-tab-inactive'}
            >
              {scanKind === 'student' ? 'Check out' : 'Sign out'}
            </button>
          </div>

          {scanKind === 'student' ? (
            <StudentIdScanPanel
              key={releaseStudent?.id || `student-${mode}`}
              schoolId={schoolId}
              mode={mode}
              onModeChange={setMode}
              onSuccess={handleScanSuccess}
              initialStudent={releaseStudent}
              fromReadyQueue={!!releaseStudent}
            />
          ) : (
            <StaffIdScanPanel
              schoolId={schoolId}
              mode={mode}
              onModeChange={setMode}
              onSuccess={handleScanSuccess}
            />
          )}
        </>
      )}

      <div className="mt-8" key={logKey}>
        <AttendanceSignLog schoolId={schoolId} title="Today&apos;s scan log" />
      </div>
    </div>
  );
}
