// @ts-nocheck
'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { toast } from 'sonner';

export default function TeacherScanModal({ schoolId, onClose, onSuccess }) {
  const [manualCode, setManualCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [facingMode, setFacingMode] = useState('environment');
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
        if (!videoRef.current || saving) return;
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
            await submitScan(code.data);
          }
        } catch {
          /* skip frame */
        }
      }, 400);
    } catch {
      toast.error('Camera access denied — use manual ID entry below');
    }
  };

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const submitScan = async (code) => {
    const value = (code || manualCode).trim();
    if (!value) {
      toast.error('Scan a QR code or enter student ID');
      return;
    }
    if (!schoolId) {
      toast.error('School not loaded — refresh the page');
      return;
    }
    setSaving(true);
    setScanning(true);
    try {
      const res = await fetch('/api/teacher/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ school_id: schoolId, qr_code: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      toast.success(data.is_late ? `Marked late (${data.minutes_late} min)` : 'Marked present');
      stopCamera();
      onSuccess?.();
      onClose();
    } catch (e) {
      toast.error(e.message || 'Scan failed');
      if (!scanIntervalRef.current) startCamera();
    }
    setSaving(false);
    setScanning(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-bold text-lg">Scan student ID</h3>
          <button type="button" onClick={() => { stopCamera(); onClose(); }} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="relative aspect-[4/3] bg-slate-900">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-40 h-40 border-2 border-white/80 rounded-xl" />
          </div>
          <button
            type="button"
            onClick={() => startCamera(facingMode === 'environment' ? 'user' : 'environment')}
            className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-3 py-2 rounded-full flex items-center gap-1"
          >
            <Camera size={14} /> Flip
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-slate-500">Point at the student&apos;s ID QR code, or type their ID below.</p>
          <input
            className="input font-mono"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Student ID or QR value"
          />
          <button
            type="button"
            onClick={() => submitScan(manualCode)}
            disabled={saving}
            className="btn-primary w-full py-3"
          >
            {saving ? 'Saving…' : 'Mark present'}
          </button>
          {scanning && <p className="text-xs text-center text-slate-400">Looking for QR…</p>}
        </div>
      </div>
    </div>
  );
}
