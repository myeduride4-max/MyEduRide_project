// @ts-nocheck
'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import StudentAvatar from '@/components/shared/StudentAvatar';
import TodayScanStatusBanner from '@/components/gate/TodayScanStatusBanner';
import StudentPickupVerify from '@/components/pickup/StudentPickupVerify';
import { applyScanHints, isActionBlocked } from '@/lib/gate/scan-hints-client';

function splitName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] || '', last: parts.slice(1).join(' ') || '' };
}

function pickupFromScan(data) {
  return {
    pickupNotice: data.pickup_notice || data.pickup_context?.pickup_notice || null,
    pickupRequest: data.pickup_request || data.pickup_context?.pickup_request || null,
    pickupPersons: data.pickup_persons || data.pickup_context?.pickup_persons || [],
    readyForPickup: !!data.ready_for_pickup,
  };
}

/** Student check-in/out via ID card (admin or gate — same API as gate manager). */
export default function StudentIdScanPanel({
  schoolId,
  mode = 'arrival',
  onModeChange,
  onSuccess,
  initialStudent = null,
  fromReadyQueue = false,
}) {
  const [manualCode, setManualCode] = useState('');
  const [scanned, setScanned] = useState(null);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [facingMode, setFacingMode] = useState('environment');
  const [releaseFromQueue, setReleaseFromQueue] = useState(fromReadyQueue);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);

  const stopCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
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
      scanIntervalRef.current = setInterval(async () => {
        if (!videoRef.current || saving || scanned) return;
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
            await lookupScan(code.data);
          }
        } catch {
          /* skip */
        }
      }, 400);
    } catch {
      toast.error('Camera access denied — enter student ID below');
    }
  };

  useEffect(() => {
    if (initialStudent?.id && schoolId) {
      const code = initialStudent.qr_code_data || initialStudent.student_id_number;
      if (code) {
        onModeChange?.('departure');
        setReleaseFromQueue(!!fromReadyQueue);
        lookupScan(code);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStudent?.id, schoolId]);

  useEffect(() => {
    if (!scanned && !initialStudent) startCamera();
    return () => stopCamera();
  }, [scanned, schoolId, initialStudent]);

  const lookupScan = async (code) => {
    const value = (code || manualCode).trim();
    if (!value) {
      toast.error('Scan student ID card or enter ID');
      return;
    }
    if (!schoolId) {
      toast.error('School not loaded');
      return;
    }
    setScanning(true);
    try {
      const res = await fetch('/api/gate/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ scan_data: value, school_id: schoolId }),
      });
      const data = await res.json();
      if (!res.ok || data.type !== 'student') {
        throw new Error(data.error || 'Student ID not found');
      }
      stopCamera();
      applyScanHints(data, { toast, setMode: onModeChange });
      setScanned(data);
    } catch (e) {
      toast.error(e.message || 'Scan failed');
      if (!scanned) startCamera();
    }
    setScanning(false);
  };

  const gateAction = mode === 'arrival' ? 'arrival' : 'departure';
  const block = isActionBlocked(scanned?.today_status, gateAction, false);
  const fullyComplete = scanned?.scan_hints?.already_complete;
  const pickup = scanned ? pickupFromScan(scanned) : null;

  const confirmScan = async () => {
    if (!scanned?.person || saving || block.blocked || fullyComplete) return;

    setSaving(true);
    try {
      const body = {
        school_id: schoolId,
        student_id: scanned.person.id,
        type: mode === 'arrival' ? 'arrival' : 'departure',
        verification_method: 'id_card_scan',
        person_type: 'student',
      };

      if (mode === 'departure') {
        body.from_ready_queue = releaseFromQueue || pickup?.readyForPickup;
        const notice = pickup?.pickupNotice;
        const request = pickup?.pickupRequest;
        if (notice?.pickup_person_name) {
          body.pickup_person_name = notice.pickup_person_name;
          body.pickup_person_phone = notice.pickup_person_phone;
        } else if (request?.pickup_person_name) {
          body.pickup_person_name = request.pickup_person_name;
          body.pickup_person_phone = request.pickup_person_phone;
        } else if (pickup?.pickupPersons?.[0]?.name) {
          body.pickup_person_name = pickup.pickupPersons[0].name;
          body.pickup_person_phone = pickup.pickupPersons[0].phone;
        }
      }

      const res = await fetch('/api/gate/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.already_recorded) {
          toast.error(data.error || 'Already signed in or out today');
          setScanned((prev) =>
            prev
              ? {
                  ...prev,
                  today_status: data.today_status ?? prev.today_status,
                  scan_hints: data.scan_hints ?? prev.scan_hints,
                }
              : prev
          );
          return;
        }
        throw new Error(data.error || 'Could not save');
      }
      toast.success(
        `${scanned.person.name} — ${mode === 'arrival' ? 'checked in' : 'released'} (ID scan)`
      );
      setScanned(null);
      setManualCode('');
      setReleaseFromQueue(false);
      onSuccess?.();
      startCamera();
    } catch (e) {
      toast.error(e.message || 'Failed');
    }
    setSaving(false);
  };

  const names = scanned?.person?.name ? splitName(scanned.person.name) : { first: '', last: '' };

  if (scanned?.person) {
    return (
      <div className="card-elevated p-4 space-y-4">
        <div className="flex items-center gap-3">
          <StudentAvatar
            photoUrl={scanned.person.photo_url}
            firstName={names.first}
            lastName={names.last}
            size="md"
          />
          <div>
            <p className="font-bold">{scanned.person.name}</p>
            <p className="text-xs font-mono text-slate-500">{scanned.person.student_id}</p>
            {scanned.person.class_name && (
              <p className="text-xs text-slate-400">{scanned.person.class_name}</p>
            )}
          </div>
        </div>
        <TodayScanStatusBanner todayStatus={scanned.today_status} />
        {block.message && (
          <p className="text-sm font-semibold text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-center">
            {block.message}
          </p>
        )}
        {mode === 'departure' && pickup && (
          <StudentPickupVerify
            pickupNotice={pickup.pickupNotice}
            pickupRequest={pickup.pickupRequest}
            pickupPersons={pickup.pickupPersons}
            readyForPickup={pickup.readyForPickup || releaseFromQueue}
          />
        )}
        <p
          className={`text-center text-sm font-bold py-2 rounded-xl ${
            mode === 'arrival' ? 'bg-emerald-50 text-emerald-800' : 'bg-orange-50 text-orange-800'
          }`}
        >
          {mode === 'arrival' ? 'STUDENT CHECK IN' : 'STUDENT CHECK OUT / RELEASE'}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary flex-1"
            onClick={() => {
              setScanned(null);
              setManualCode('');
              setReleaseFromQueue(false);
              startCamera();
            }}
          >
            Cancel
          </button>
          {!fullyComplete ? (
            <button
              type="button"
              className="btn-primary flex-1"
              disabled={saving || block.blocked}
              onClick={confirmScan}
            >
              {saving ? 'Saving…' : mode === 'departure' ? 'Confirm release' : 'Confirm scan'}
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={() => {
                setScanned(null);
                setManualCode('');
                setReleaseFromQueue(false);
                startCamera();
              }}
            >
              Done
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card-elevated overflow-hidden">
      <div className="relative aspect-[4/3] bg-slate-900">
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
        <button
          type="button"
          onClick={() => startCamera(facingMode === 'environment' ? 'user' : 'environment')}
          className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-3 py-2 rounded-full flex items-center gap-1"
        >
          <Camera size={14} /> Flip
        </button>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <ScanLine size={14} /> Scan student ID — one check-in and check-out per day
        </p>
        <input
          className="input font-mono"
          placeholder="Student ID or QR"
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
        />
        <button
          type="button"
          className="btn-primary w-full"
          disabled={scanning || saving}
          onClick={() => lookupScan(manualCode)}
        >
          {scanning ? 'Looking up…' : 'Look up student'}
        </button>
      </div>
    </div>
  );
}
