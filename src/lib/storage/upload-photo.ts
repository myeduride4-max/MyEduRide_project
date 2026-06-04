import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'photos';

/** Normalize base64 / data-URL to a buffer. */
export function base64ToBuffer(photoBase64: string): Buffer | null {
  if (!photoBase64 || typeof photoBase64 !== 'string') return null;
  const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '').trim();
  if (base64Data.length < 100) return null;
  try {
    return Buffer.from(base64Data, 'base64');
  } catch {
    return null;
  }
}

/**
 * Upload JPEG to the photos bucket. Returns the storage path (stored in photo_url).
 * Paths work with /api/photo and loadPhotoDataUrl — no public URL required.
 */
export async function uploadBase64Photo(
  supabase: SupabaseClient,
  storagePath: string,
  photoBase64: string
): Promise<{ path: string | null; error: string | null }> {
  const buffer = base64ToBuffer(photoBase64);
  if (!buffer) {
    return { path: null, error: 'Invalid or empty image data' };
  }

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true });

  if (error) {
    console.error('[upload-photo]', storagePath, error.message);
    return { path: null, error: error.message };
  }

  return { path: storagePath, error: null };
}

/** Delete a photo object when removing a person (best-effort). */
export async function deleteStoragePhoto(
  supabase: SupabaseClient,
  photoUrl: string | null | undefined
): Promise<void> {
  if (!photoUrl) return;
  const path = photoUrl.includes('://')
    ? photoUrl.match(/\/photos\/(.+)$/)?.[1]
    : photoUrl;
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
}
