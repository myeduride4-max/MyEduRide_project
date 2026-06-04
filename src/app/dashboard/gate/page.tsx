// @ts-nocheck
'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { fetchData } from '@/lib/api';
import StudentAvatar from '@/components/shared/StudentAvatar';
import {
  LogIn,
  LogOut,
  Camera,
  CheckCircle,
  XCircle,
  ScanLine,
  Users,
  Car,
  Search,
  UserCheck,
  Bell,
} from 'lucide-react';
import NotificationsInbox from '@/components/notifications/NotificationsInbox';
import GateActivitiesReport from '@/components/gate/GateActivitiesReport';
import TodayScanStatusBanner from '@/components/gate/TodayScanStatusBanner';
import { applyScanHints, isActionBlocked } from '@/lib/gate/scan-hints-client';
import { toast } from 'sonner';
import { photoSrc } from '@/lib/photo';
import ReadyForPickupList from '@/components/gate/ReadyForPickupList';
import StudentPickupVerify from '@/components/pickup/StudentPickupVerify';

function splitName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] || '', last: parts.slice(1).join(' ') || '' };
}

export default function GateOfficerDashboard() {
  const [gateMode, setGateMode] = useState('arrival');
  const [sessionActive, setSessionActive] = useState(false);
  const [gateTab, setGateTab] = useState('scan');
  const [currentTime, setCurrentTime] = useState(null);
  const [todayCount, setTodayCount] = useState(0);
  const [schoolId, setSchoolId] = useState('');
  const [schoolReady, setSchoolReady] = useState(false);
  const [gateSessionId, setGateSessionId] = useState(null);
  const [scannedPerson, setScannedPerson] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [facingMode, setFacingMode] = useState('environment');
  const [allStudents, setAllStudents] = useState([]);
  const [pickupQueue, setPickupQueue] = useState([]);
  const [pickupNotices, setPickupNotices] = useState([]);
  const [pickupPersonsByStudent, setPickupPersonsByStudent] = useState({});
  const [pickupRequests, setPickupRequests] = useState([]);
  const [pickupRequestsByStudent, setPickupRequestsByStudent] = useState({});
  const [schoolInfo, setSchoolInfo] = useState({ name: '', logo_url: '', primary_color: '#1B4D3E' });
  const [studentSearch, setStudentSearch] = useState('');
  const [gateDay, setGateDay] = useState({ gate_open: true, label: null, has_override: false });
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);

  const scannedNames = useMemo(() => {
    if (!scannedPerson?.person?.name) return { first: '', last: '' };
    return splitName(scannedPerson.person.name);
  }, [scannedPerson]);

  const noticeForStudent = useCallback(
    (studentId) => pickupNotices.find((n) => n.student_id === studentId),
    [pickupNotices]
  );

  const pickupRequestForStudent = useCallback(
    (studentId) => pickupRequestsByStudent[studentId] || null,
    [pickupRequestsByStudent]
  );

  const attachPickupContext = useCallback(
    (studentId) => {
      const notice = noticeForStudent(studentId);
      const request = pickupRequestForStudent(studentId);
      const persons =
        pickupPersonsByStudent[studentId] ||
        notice?.authorised_pickup_persons ||
        request?.authorised_pickup_persons ||
        [];
      return {
        pickup_notice: notice || null,
        pickup_request: request || null,
        pickup_persons: persons,
      };
    },
    [noticeForStudent, pickupRequestForStudent, pickupPersonsByStudent]
  );

  const loadGateData = useCallback(async () => {
    if (!schoolId) return;
    try {
      const res = await fetch(`/api/gate/dashboard?school_id=${schoolId}&t=${Date.now()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not load pickup queue');
        return;
      }
      if (data.students) setAllStudents(data.students);
      setPickupQueue(data.pickup_queue || []);
      if (data.pickup_notices) setPickupNotices(data.pickup_notices);
      if (data.pickup_persons_by_student) setPickupPersonsByStudent(data.pickup_persons_by_student);
      if (data.pickup_requests) setPickupRequests(data.pickup_requests);
      if (data.pickup_requests_by_student) setPickupRequestsByStudent(data.pickup_requests_by_student);
      if (data.school) {
        setSchoolInfo({
          name: data.school.name || '',
          logo_url: data.school.logo_url || '',
          primary_color: data.school.primary_color || '#1B4D3E',
        });
      }
      if (data.gate_day) setGateDay(data.gate_day);
    } catch (e) {
      console.error(e);
      toast.error('Could not load gate data');
    }
  }, [schoolId]);

  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    loadSchool();
    return () => {
      clearInterval(timer);
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (!schoolId) return undefined;
    loadGateData();
    const poll = setInterval(loadGateData, 15000);
    return () => clearInterval(poll);
  }, [schoolId, loadGateData]);

  useEffect(() => {
    if (sessionActive && gateTab === 'scan' && !scannedPerson) {
      requestAnimationFrame(() => startCamera());
    } else if (gateTab !== 'scan') {
      stopCamera();
    }
  }, [gateTab, sessionActive, scannedPerson]);

  const loadSchool = async () => {
    try {
      const data = await fetchData('get_school_admin_data', { role: 'gate_officer' });
      if (data.school_id) {
        setSchoolId(data.school_id);
        setSchoolReady(true);
      } else {
        toast.error('No school linked to your gate officer account');
      }
      if (data.school) {
        setSchoolInfo({
          name: data.school.name || '',
          logo_url: data.school.logo_url || '',
          primary_color: data.school.primary_color || '#1B4D3E',
        });
      }
    } catch {
      toast.error('Could not load school');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const startQrScanning = () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    scanIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || scanning || scannedPerson) return;
      const vw = videoRef.current.videoWidth;
      const vh = videoRef.current.videoHeight;
      if (!vw || !vh) return;
      const canvas = document.createElement('canvas');
      canvas.width = vw;
      canvas.height = vh;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(videoRef.current, 0, 0);
      const imageData = ctx.getImageData(0, 0, vw, vh);
      try {
        const jsQR = (await import('jsqr')).default;
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code?.data) {
          clearInterval(scanIntervalRef.current);
          scanIntervalRef.current = null;
          await lookupPerson(code.data);
        }
      } catch {
        /* skip */
      }
    }, 400);
  };

  const startCamera = async (facing = facingMode) => {
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: false,
      });
      streamRef.current = stream;
      setFacingMode(facing);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      startQrScanning();
    } catch {
      toast.error('Camera access denied');
    }
  };

  const removeFromPickupQueue = useCallback((studentId) => {
    if (!studentId) return;
    setPickupQueue((q) =>
      q.filter((item) => {
        const sid = item.student?.id || item.student_id;
        return sid !== studentId;
      })
    );
  }, []);

  const resumeScanning = useCallback(async () => {
    const releasedStudentId = scannedPerson?.type === 'student' ? scannedPerson.person?.id : null;
    setScannedPerson(null);
    setScanning(false);
    if (releasedStudentId) removeFromPickupQueue(releasedStudentId);
    await loadGateData();
    if (gateTab === 'scan') {
      requestAnimationFrame(() => setTimeout(() => startCamera(), 150));
    }
  }, [scannedPerson, removeFromPickupQueue, loadGateData, gateTab]);

  const switchCamera = () => {
    const newMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newMode);
    startCamera(newMode);
  };

  const lookupPerson = async (scanData) => {
    setScanning(true);
    try {
      const res = await fetch('/api/gate/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ scan_data: scanData, school_id: schoolId }),
      });
      const data = await res.json();
      if (data.code === 'gate_closed') {
        toast.error(data.error || 'Gate is closed today');
        startQrScanning();
        setScanning(false);
        return;
      }
      if (data.person) {
        stopCamera();
        const enriched = { ...data };
        if (data.type === 'student') {
          Object.assign(enriched, attachPickupContext(data.person.id));
          if (data.pickup_notice) enriched.pickup_notice = data.pickup_notice;
          if (data.pickup_request) enriched.pickup_request = data.pickup_request;
          if (data.pickup_persons?.length) enriched.pickup_persons = data.pickup_persons;
          if (data.ready_for_pickup) enriched.from_queue = true;
        }
        applyScanHints(data, { toast, setMode: setGateMode });
        setScannedPerson(enriched);
        setGateTab('scan');
      } else {
        toast.error(data.error || 'ID not found');
        startQrScanning();
      }
    } catch {
      toast.error('Scan failed');
      startQrScanning();
    }
    setScanning(false);
  };

  const openStudentForRelease = async (student, fromQueue = false) => {
    const localCtx = attachPickupContext(student.id);
    setGateMode('dismissal');
    let today_status = null;
    let scan_hints = null;
    let pickup_notice = localCtx.pickup_notice;
    let pickup_request = localCtx.pickup_request;
    let pickup_persons = localCtx.pickup_persons || [];
    try {
      const scanValue = student.qr_code_data || student.student_id_number;
      if (scanValue && schoolId) {
        const res = await fetch('/api/gate/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ scan_data: scanValue, school_id: schoolId }),
        });
        const data = await res.json();
        today_status = data.today_status;
        scan_hints = data.scan_hints;
        pickup_notice =
          data.pickup_notice ||
          data.pickup_context?.pickup_notice ||
          pickup_notice;
        pickup_request =
          data.pickup_request ||
          data.pickup_context?.pickup_request ||
          pickup_request;
        pickup_persons =
          (data.pickup_persons?.length ? data.pickup_persons : null) ||
          data.pickup_context?.pickup_persons ||
          pickup_persons;
        applyScanHints(data, { toast, setMode: setGateMode });
      }
    } catch {
      /* status optional */
    }

    if (today_status?.has_departure) {
      toast.info(`${student.first_name} was already checked out today`);
      removeFromPickupQueue(student.id);
      await loadGateData();
      return;
    }

    setScannedPerson({
      type: 'student',
      from_queue: fromQueue,
      pickup_notice,
      pickup_request,
      pickup_persons,
      today_status,
      scan_hints,
      person: {
        id: student.id,
        name: `${student.first_name} ${student.last_name}`,
        student_id: student.student_id_number,
        class_name: student.class?.name || '',
        photo_url: student.photo_url,
        qr_code_data: student.qr_code_data,
      },
    });
    setGateTab('scan');
    stopCamera();
  };

  const handleAccept = async () => {
    if (!scannedPerson || accepting) return;
    setAccepting(true);
    try {
      const body = {
        school_id: schoolId,
        gate_session_id: gateSessionId,
        type: scanActionMode,
        verification_method: 'id_card_scan',
        person_type: scannedPerson.type,
      };
      if (scannedPerson.type === 'staff') {
        body.staff_profile_id = scannedPerson.person.id;
        body.user_id = scannedPerson.person.user_id;
      } else {
        body.student_id = scannedPerson.person.id;
        if (scanActionMode === 'departure') {
          body.from_ready_queue = !!scannedPerson.from_queue;
          const notice =
            scannedPerson.pickup_notice ||
            pickupNotices.find((n) => n.student_id === scannedPerson.person.id);
          if (notice?.pickup_person_name) {
            body.pickup_person_name = notice.pickup_person_name;
            body.pickup_person_phone = notice.pickup_person_phone;
          } else if (scannedPerson.pickup_request?.pickup_person_name) {
            body.pickup_person_name = scannedPerson.pickup_request.pickup_person_name;
            body.pickup_person_phone = scannedPerson.pickup_request.pickup_person_phone;
          } else if (scannedPerson.pickup_persons?.[0]?.name) {
            body.pickup_person_name = scannedPerson.pickup_persons[0].name;
            body.pickup_person_phone = scannedPerson.pickup_persons[0].phone;
          }
        }
      }
      const res = await fetch('/api/gate/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        const action =
          scannedPerson.type === 'staff'
            ? gateMode === 'arrival'
              ? 'signed in'
              : 'signed out'
            : gateMode === 'arrival'
              ? 'checked in'
              : 'checked out';
        const lateNote =
          data.is_late && data.minutes_late != null
            ? ` (${data.minutes_late} min late)`
            : data.is_late
              ? ' (late)'
              : '';
        toast.success(`${scannedPerson.person.name} — ${action}${lateNote}`);
        setTodayCount((p) => p + 1);
        await resumeScanning();
      } else {
        const msg = data.error || 'Failed to log';
        toast.error(msg);
        if (data.already_recorded) {
          if (scannedPerson.type === 'student' && scanActionMode === 'departure') {
            removeFromPickupQueue(scannedPerson.person.id);
          }
          await resumeScanning();
        }
      }
    } catch {
      toast.error('Failed — try again');
    }
    setAccepting(false);
  };

  const handleStartSession = async () => {
    if (!schoolReady || !schoolId) {
      toast.error('School not loaded');
      return;
    }
    try {
      const res = await fetch('/api/gate/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'start', school_id: schoolId, mode: gateMode }),
      });
      const data = await res.json();
      if (!data.success || !data.session_id) {
        toast.error(data.error || 'Could not start session');
        return;
      }
      setGateSessionId(data.session_id);
      setSessionActive(true);
      await loadGateData();
      setGateTab('scan');
    } catch {
      toast.error('Could not start session');
    }
  };

  const handleEndSession = async () => {
    if (!confirm('End session?')) return;
    if (gateSessionId) {
      await fetch('/api/gate/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'end', session_id: gateSessionId }),
      }).catch(() => {});
    }
    setSessionActive(false);
    setGateSessionId(null);
    setTodayCount(0);
    stopCamera();
    setScannedPerson(null);
  };

  const filteredStudents = allStudents.filter((s) => {
    const q = studentSearch.toLowerCase();
    return `${s.first_name} ${s.last_name} ${s.student_id_number} ${s.class?.name || ''}`.toLowerCase().includes(q);
  });

  const scanActionMode = gateMode === 'arrival' ? 'arrival' : 'departure';

  const gateBlock = isActionBlocked(
    scannedPerson?.today_status,
    scanActionMode,
    scannedPerson?.type === 'staff'
  );
  const gateClosedReason = !gateDay.gate_open ? gateDay.label || 'School closed today' : null;
  const gateBlockReason = gateClosedReason || (gateBlock.blocked ? gateBlock.message : null);
  const fullyComplete = scannedPerson?.scan_hints?.already_complete ||
    (scannedPerson?.today_status &&
      ((scannedPerson.type === 'staff' &&
        scannedPerson.today_status.has_clock_in &&
        scannedPerson.today_status.has_clock_out) ||
        (scannedPerson.type === 'student' &&
          scannedPerson.today_status.has_arrival &&
          scannedPerson.today_status.has_departure)));

  /** Checkout: dismissal session OR scan switched mode to departure after check-in */
  const isStudentCheckout =
    scannedPerson?.type === 'student' &&
    (gateMode === 'dismissal' || gateMode === 'departure');

  const schoolLogoSrc = photoSrc(schoolInfo.logo_url);

  const renderAcceptCard = () => (
    <div className="card-elevated p-5 mt-2">
      {schoolInfo.name && (
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100">
          {schoolLogoSrc ? (
            <img
              src={schoolLogoSrc}
              alt=""
              className="h-12 w-12 object-contain rounded-lg border border-slate-200 bg-white shrink-0"
            />
          ) : (
            <div className="h-12 w-12 rounded-lg bg-primary-100 flex items-center justify-center shrink-0">
              <span className="text-primary-800 font-black text-sm">
                {schoolInfo.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
              </span>
            </div>
          )}
          <p className="text-lg font-black text-slate-900 uppercase tracking-tight leading-tight flex-1">
            {schoolInfo.name}
          </p>
        </div>
      )}

      {scannedPerson.type === 'student' && (
        <div className="mb-4 p-4 rounded-2xl border-2 border-slate-200 bg-gradient-to-br from-slate-50 to-white">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 text-center">
            Student ID
          </p>
          <div className="flex flex-col items-center gap-2">
            {photoSrc(scannedPerson.person.photo_url) ? (
              <img
                src={photoSrc(scannedPerson.person.photo_url)}
                alt=""
                className="w-28 h-28 rounded-2xl object-cover border-4 border-white shadow-lg ring-2 ring-primary-200"
              />
            ) : (
              <StudentAvatar
                photoUrl={scannedPerson.person.photo_url}
                firstName={scannedNames.first}
                lastName={scannedNames.last}
                size="lg"
              />
            )}
            <p className="text-xl font-black text-slate-900 text-center leading-tight">
              {scannedPerson.person.name}
            </p>
            <p className="text-base font-mono font-bold text-primary-700 bg-primary-50 px-4 py-1.5 rounded-lg">
              {scannedPerson.person.student_id}
            </p>
            {scannedPerson.person.class_name && (
              <p className="text-sm font-semibold text-slate-600">{scannedPerson.person.class_name}</p>
            )}
          </div>
        </div>
      )}

      {scannedPerson.type === 'staff' && (
        <div className="flex items-center gap-4 mb-4">
          <StudentAvatar
            photoUrl={scannedPerson.person.photo_url}
            firstName={scannedNames.first}
            lastName={scannedNames.last}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xl font-bold text-slate-900 truncate">{scannedPerson.person.name}</p>
            <p className="text-sm text-slate-500 font-mono">{scannedPerson.person.staff_id}</p>
            {scannedPerson.person.role_label && (
              <p className="text-xs text-violet-600 capitalize">{scannedPerson.person.role_label}</p>
            )}
          </div>
        </div>
      )}
      <TodayScanStatusBanner
        todayStatus={scannedPerson.today_status}
        isStaff={scannedPerson.type === 'staff'}
      />
      {gateBlockReason && (
        <p className="text-sm font-semibold text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-3 mb-4 text-center">
          {gateBlockReason}
        </p>
      )}
      {isStudentCheckout && (
        <StudentPickupVerify
          pickupNotice={scannedPerson.pickup_notice}
          pickupRequest={scannedPerson.pickup_request}
          pickupPersons={scannedPerson.pickup_persons || []}
          readyForPickup={!!scannedPerson.from_queue}
        />
      )}
      {scannedPerson.from_queue && !fullyComplete && (
        <p className="text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 mb-4">
          Ready for pickup — teacher dismissed this student
        </p>
      )}
      {fullyComplete && scannedPerson.type === 'student' && (
        <p className="text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 mb-4">
          Already signed in and out today — tap Done to return to the list.
        </p>
      )}
      <div
        className={`text-center py-3 rounded-xl mb-4 text-sm font-bold ${
          gateMode === 'arrival' ? 'bg-emerald-50 text-emerald-800' : 'bg-orange-50 text-orange-800'
        }`}
      >
        {scannedPerson.type === 'staff'
          ? (gateMode === 'arrival' ? 'STAFF SIGN IN' : 'STAFF SIGN OUT')
          : (gateMode === 'arrival' ? 'CHECK IN' : 'CHECK OUT / RELEASE')}
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={resumeScanning} disabled={accepting} className="btn-danger flex-1 flex items-center justify-center gap-2 py-3">
          <XCircle size={18} /> Cancel
        </button>
        {!fullyComplete ? (
          <button
            type="button"
            onClick={handleAccept}
            disabled={accepting || !!gateBlockReason}
            className="btn-primary flex-1 flex items-center justify-center gap-2 py-3 disabled:opacity-50"
          >
            <CheckCircle size={18} />
            {accepting ? 'Saving…' : scannedPerson.type === 'staff' ? 'Confirm staff' : 'Confirm'}
          </button>
        ) : (
          <button type="button" onClick={resumeScanning} className="btn-primary flex-1 py-3">
            Done — scan next person
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col pt-12 pb-6">
      <header className="px-4 py-2 max-w-lg mx-auto w-full flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {schoolLogoSrc && (
            <img src={schoolLogoSrc} alt="" className="h-9 w-9 object-contain rounded-lg border border-slate-200 bg-white shrink-0" />
          )}
          <div className="min-w-0">
            {schoolInfo.name && (
              <p className="text-xs font-black text-slate-900 uppercase tracking-tight truncate leading-tight">
                {schoolInfo.name}
              </p>
            )}
            <p className="text-sm font-mono font-bold text-slate-600">
              {currentTime ? currentTime.toLocaleTimeString() : '--:--'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {sessionActive && <span className="text-sm font-bold">{todayCount} scans</span>}
          {sessionActive ? (
            <button type="button" onClick={handleEndSession} className="btn-danger text-xs px-3 py-2">End</button>
          ) : (
            <button type="button" onClick={handleStartSession} disabled={!schoolReady} className="btn-primary text-xs px-3 py-2">
              Start scan
            </button>
          )}
        </div>
      </header>

      {!sessionActive && (
        <div className="mx-4 max-w-lg mx-auto w-full mb-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-900">
          <p className="font-semibold">Ready-for-pickup list is live</p>
          <p className="text-xs mt-0.5 text-primary-800">
            View the Ready tab anytime. Start a scan session when you are ready to check in/out at the gate.
          </p>
        </div>
      )}

      {!gateDay.gate_open && (
        <div className="mx-4 max-w-lg mb-3 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-bold">Gate closed today</p>
          <p className="mt-0.5">{gateDay.label || 'Non-school day'} — check-in, release, and scans are blocked. School admin can add a gate override on the calendar.</p>
        </div>
      )}

      <div className="px-4 max-w-lg mx-auto w-full">
        <div className="pill-tabs mb-3">
          <button type="button" onClick={() => { setGateTab('scan'); setScannedPerson(null); }} className={gateTab === 'scan' ? 'pill-tab-active' : 'pill-tab-inactive'}>
            <ScanLine size={14} className="inline mr-1" /> Scan
          </button>
          <button type="button" onClick={() => setGateTab('pickup')} className={gateTab === 'pickup' ? 'pill-tab-active' : 'pill-tab-inactive'}>
            <Car size={14} className="inline mr-1" /> Ready ({pickupQueue.length})
          </button>
          <button type="button" onClick={() => setGateTab('students')} className={gateTab === 'students' ? 'pill-tab-active' : 'pill-tab-inactive'}>
            <Users size={14} className="inline mr-1" /> All ({allStudents.length})
          </button>
          <button type="button" onClick={() => setGateTab('alerts')} className={gateTab === 'alerts' ? 'pill-tab-active' : 'pill-tab-inactive'}>
            <Bell size={14} className="inline mr-1" /> Alerts
          </button>
          <button type="button" onClick={() => setGateTab('log')} className={gateTab === 'log' ? 'pill-tab-active' : 'pill-tab-inactive'}>
            <LogIn size={14} className="inline mr-1" /> Log
          </button>
        </div>
      </div>

      <main className="flex-1 px-4 max-w-lg mx-auto w-full overflow-y-auto">
        {scannedPerson && gateTab === 'scan' && renderAcceptCard()}

        {gateTab === 'scan' && !scannedPerson && !sessionActive && (
          <div className="card-elevated p-5 space-y-4 mb-4">
            <p className="text-sm font-semibold text-slate-800 text-center">Start gate session to scan</p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setGateMode('arrival')} className={`p-4 rounded-2xl border-2 ${gateMode === 'arrival' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                <LogIn className="mx-auto mb-2 text-emerald-600" size={26} />
                <span className="block text-sm font-semibold">Arrival</span>
              </button>
              <button type="button" onClick={() => setGateMode('dismissal')} className={`p-4 rounded-2xl border-2 ${gateMode === 'dismissal' ? 'border-orange-500 bg-orange-50' : 'border-slate-200'}`}>
                <LogOut className="mx-auto mb-2 text-orange-600" size={26} />
                <span className="block text-sm font-semibold">Dismissal</span>
              </button>
            </div>
            <button type="button" onClick={handleStartSession} disabled={!schoolReady} className="btn-primary w-full py-3.5 disabled:opacity-50">
              {schoolReady ? 'Start gate session' : 'Loading…'}
            </button>
          </div>
        )}

        {gateTab === 'scan' && !scannedPerson && sessionActive && (
          <>
            <div className="aspect-[4/3] bg-slate-900 rounded-3xl overflow-hidden relative mb-3 shadow-lg">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-44 h-44 border-2 border-white/80 rounded-2xl" />
              </div>
              <button type="button" onClick={switchCamera} className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-3 py-2 rounded-full flex items-center gap-1">
                <Camera size={14} /> Flip
              </button>
            </div>
            <p className="text-xs text-center text-slate-500">
              Scan student or staff ID card · one sign-in and one sign-out per day
            </p>
          </>
        )}

        {gateTab === 'pickup' && !scannedPerson && schoolId && (
          <div className="pb-4">
            <ReadyForPickupList
              schoolId={schoolId}
              onRelease={(student) => openStudentForRelease(student, true)}
              showReleaseButton
            />
          </div>
        )}

        {gateTab === 'log' && !scannedPerson && schoolId && (
          <div className="pb-4">
            <GateActivitiesReport schoolId={schoolId} title="Release & gate log" />
          </div>
        )}

        {gateTab === 'alerts' && !scannedPerson && (
          <div className="space-y-4 pb-4">
            <NotificationsInbox schoolId={schoolId} compact />
            <div>
              <h2 className="text-sm font-bold text-slate-800 mb-2">Today&apos;s pickup messages</h2>
              {pickupRequests.length === 0 ? (
                <div className="card text-center py-6 text-slate-400 text-sm">No parent pickup messages today</div>
              ) : (
                pickupRequests.map((r) => {
                  const st = r.student;
                  const s = Array.isArray(st) ? st[0] : st;
                  const pickupSrc = photoSrc(r.pickup_person_photo);
                  return (
                    <div key={r.id} className="card p-3 mb-2 text-sm flex gap-3">
                      {pickupSrc ? (
                        <img src={pickupSrc} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0 border border-slate-200" />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-slate-100 shrink-0 flex items-center justify-center text-[10px] text-slate-400">No photo</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{s?.first_name} {s?.last_name}</p>
                        <p className="text-blue-800 mt-1">
                          <strong>{r.pickup_person_name}</strong>
                          {r.pickup_person_phone ? ` · ${r.pickup_person_phone}` : ''}
                        </p>
                        {r.message && <p className="text-xs text-slate-600 mt-1">{r.message}</p>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {gateTab === 'students' && !scannedPerson && (
          <div className="pb-4">
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
              Reference only — release students from the Ready tab after teacher marks them ready.
            </p>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="search"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search all registered students…"
                className="input pl-9"
              />
            </div>
            <div className="card-elevated divide-y max-h-[60vh] overflow-y-auto">
              {filteredStudents.map((s) => {
                const inQueue = pickupQueue.some((q) => q.student?.id === s.id);
                const notice = noticeForStudent(s.id);
                return (
                  <div key={s.id} className="list-row py-3">
                    <StudentAvatar photoUrl={s.photo_url} firstName={s.first_name} lastName={s.last_name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{s.first_name} {s.last_name}</p>
                      <p className="text-xs text-slate-500 font-mono">{s.student_id_number}</p>
                      {inQueue && <span className="text-[10px] text-orange-600 font-semibold">Waiting pickup</span>}
                      {notice && <p className="text-[10px] text-blue-600">Pickup: {notice.pickup_person_name}</p>}
                    </div>
                    {inQueue ? (
                      <button
                        type="button"
                        onClick={() => openStudentForRelease(s, true)}
                        className="text-xs btn-primary px-2 py-1.5 shrink-0"
                      >
                        Release
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => s.qr_code_data && lookupPerson(s.qr_code_data)}
                        className="text-xs btn-secondary px-2 py-1.5 shrink-0"
                        title="Arrival scan only"
                      >
                        Scan
                      </button>
                    )}
                  </div>
                );
              })}
              {filteredStudents.length === 0 && (
                <p className="py-8 text-center text-slate-400 text-sm">No students found</p>
              )}
            </div>
          </div>
        )}

        {scannedPerson && gateTab !== 'scan' && renderAcceptCard()}
      </main>
    </div>
  );
}
