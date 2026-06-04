'use client';

import { useRef, useState } from 'react';
import { Camera, X, SwitchCamera } from 'lucide-react';
import { toast } from 'sonner';
import { averageDescriptors, computeDescriptorFromDataUrl } from '@/lib/face/descriptor';

type FaceCaptureProps = {
  label?: string;
  minPhotos?: number;
  maxPhotos?: number;
  /** 'user' = front/selfie, 'environment' = back/rear (better for photographing someone else) */
  defaultFacingMode?: 'user' | 'environment';
  onChange: (payload: { photos: string[]; face_descriptor: number[] | null }) => void;
};

export default function FaceCapture({
  label = 'Face photos',
  minPhotos = 3,
  maxPhotos = 3,
  defaultFacingMode = 'environment',
  onChange,
}: FaceCaptureProps) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(defaultFacingMode);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const updateParent = async (next: string[]) => {
    if (next.length === 0) {
      onChange({ photos: [], face_descriptor: null });
      return;
    }
    try {
      const descriptors = await Promise.all(next.map((p) => computeDescriptorFromDataUrl(p)));
      onChange({ photos: next, face_descriptor: averageDescriptors(descriptors) });
    } catch {
      onChange({ photos: next, face_descriptor: null });
    }
  };

  const startCamera = async (facing: 'user' | 'environment' = facingMode) => {
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: facing },
        audio: false,
      });
      streamRef.current = stream;
      setFacingMode(facing);
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 100);
    } catch {
      toast.error('Camera access denied');
    }
  };

  const flipCamera = () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    startCamera(next);
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = async () => {
    if (!videoRef.current) return;
    const vw = videoRef.current.videoWidth;
    const vh = videoRef.current.videoHeight;
    if (!vw || !vh) {
      toast.error('Camera not ready — wait a moment and try again');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = vw;
    canvas.height = vh;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    if (dataUrl.length < 5000) {
      toast.error('Photo too small — hold steady and capture again');
      return;
    }
    const next = [...photos, dataUrl].slice(0, maxPhotos);
    setPhotos(next);
    await updateParent(next);
    if (next.length >= maxPhotos) stopCamera();
  };

  const removePhoto = async (index: number) => {
    const next = photos.filter((_, i) => i !== index);
    setPhotos(next);
    await updateParent(next);
  };

  const facingLabel = facingMode === 'environment' ? 'Back camera' : 'Front camera';

  return (
    <div>
      <h3 className="font-semibold text-sm mb-1">{label} *</h3>
      <p className="text-xs text-gray-500 mb-3">
        Take {minPhotos} clear photos. Use <strong>back camera</strong> to photograph the student; flip to front if needed.
      </p>

      {!cameraActive ? (
        <button
          type="button"
          onClick={() => startCamera()}
          className="w-full py-6 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center gap-2 hover:border-primary-400 hover:bg-primary-50"
        >
          <Camera size={24} className="text-gray-400" />
          <span className="text-sm text-gray-500">Open camera ({facingLabel})</span>
        </button>
      ) : (
        <div>
          <div className="relative rounded-xl overflow-hidden bg-gray-900 mb-3">
            <video ref={videoRef} autoPlay playsInline muted className="w-full min-h-[220px] object-cover" />
            <button
              type="button"
              onClick={flipCamera}
              className="absolute bottom-3 right-3 bg-black/60 backdrop-blur text-white text-xs font-medium px-3 py-2 rounded-full flex items-center gap-1.5"
            >
              <SwitchCamera size={14} />
              Flip ({facingMode === 'user' ? 'back' : 'front'})
            </button>
          </div>
          <p className="text-xs text-center text-slate-500 mb-2">Active: {facingLabel}</p>
          <button
            type="button"
            onClick={capturePhoto}
            disabled={photos.length >= maxPhotos}
            className="btn-primary w-full mb-2"
          >
            {photos.length < maxPhotos ? `Capture photo ${photos.length + 1}/${maxPhotos}` : 'Done'}
          </button>
          <button type="button" onClick={stopCamera} className="btn-secondary w-full text-sm">
            Close camera
          </button>
        </div>
      )}

      {photos.length > 0 && (
        <div className="flex gap-2 mt-3 flex-wrap">
          {photos.map((p, i) => (
            <div key={i} className="relative">
              <img src={p} alt={`Face ${i + 1}`} className="w-16 h-16 rounded-lg object-cover border-2 border-primary-300" />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
              >
                <X size={12} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className={`text-xs mt-2 ${photos.length >= minPhotos ? 'text-green-600' : 'text-amber-600'}`}>
        {photos.length}/{minPhotos} photos captured
      </p>
    </div>
  );
}
