'use client';

import { useRef, useState } from 'react';
import { Camera, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

type StaffIdPhotoProps = {
  label?: string;
  optional?: boolean;
  onChange: (photoBase64: string | null) => void;
};

/** Single portrait for staff ID card (optional). Gate officers use FaceCapture separately. */
export default function StaffIdPhoto({
  label = 'ID card photo',
  optional = true,
  onChange,
}: StaffIdPhotoProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const setPhoto = (dataUrl: string | null) => {
    setPreview(dataUrl);
    onChange(dataUrl);
  };

  const readFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Choose a JPG or PNG image');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.onerror = () => toast.error('Could not read image');
    reader.readAsDataURL(file);
  };

  return (
    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
      <p className="text-xs font-semibold text-slate-700 mb-2">
        {label}
        {optional ? (
          <span className="font-normal text-slate-500"> (optional — needed for ID card PDF)</span>
        ) : (
          <span className="text-red-600"> *</span>
        )}
      </p>
      <div className="flex gap-3 items-start">
        <div className="w-24 h-28 rounded-xl border-2 border-dashed border-slate-300 bg-white flex items-center justify-center overflow-hidden shrink-0">
          {preview ? (
            <img src={preview} alt="" className="w-full h-full object-cover" />
          ) : (
            <Camera className="text-slate-300" size={28} />
          )}
        </div>
        <div className="flex flex-col gap-2 flex-1">
          <button
            type="button"
            className="btn-secondary text-xs py-2 flex items-center justify-center gap-1"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={14} /> Upload photo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) readFile(f);
              e.target.value = '';
            }}
          />
          {preview && (
            <button
              type="button"
              className="text-xs text-red-600 flex items-center gap-1"
              onClick={() => setPhoto(null)}
            >
              <X size={12} /> Remove photo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
