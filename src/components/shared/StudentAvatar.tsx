'use client';

import { useState } from 'react';
import { photoSrc } from '@/lib/photo';

type StudentAvatarProps = {
  photoUrl?: string | null;
  firstName?: string;
  lastName?: string;
  size?: 'sm' | 'md' | 'lg';
  accentColor?: string;
  className?: string;
};

const sizes = {
  sm: 'w-10 h-10 text-sm rounded-full',
  md: 'w-14 h-14 text-base rounded-full',
  lg: 'w-20 h-20 text-xl rounded-full',
};

export default function StudentAvatar({
  photoUrl,
  firstName = '',
  lastName = '',
  size = 'md',
  accentColor = '#1B4D3E',
}: StudentAvatarProps) {
  const [failed, setFailed] = useState(false);
  const src = photoSrc(photoUrl);
  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={`${firstName} ${lastName}`.trim()}
        className={`${sizes[size]} object-cover shrink-0 border-2 border-white shadow-md ring-1 ring-gray-100`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`${sizes[size]} flex items-center justify-center text-white font-bold shrink-0 shadow-sm`}
      style={{ backgroundColor: accentColor }}
    >
      {initials}
    </div>
  );
}
