import type { SupabaseClient } from '@supabase/supabase-js';

export function extractStoragePath(input: string): string | null {
  try {
    const decoded = decodeURIComponent(input);
    const publicMatch = decoded.match(/\/storage\/v1\/object\/public\/photos\/(.+)$/);
    if (publicMatch) return publicMatch[1];
    const signedMatch = decoded.match(/\/storage\/v1\/object\/sign\/photos\/(.+?)(\?|$)/);
    if (signedMatch) return signedMatch[1];
    if (!decoded.includes('://') && !decoded.startsWith('/')) return decoded;
  } catch {
    return null;
  }
  return null;
}

/** Load photo as data URL using service role (works when bucket is private). */
export async function loadPhotoDataUrl(
  supabase: SupabaseClient,
  photoUrl: string | null | undefined
): Promise<string | null> {
  if (!photoUrl) return null;

  const path = extractStoragePath(photoUrl);
  if (!path) return null;

  const { data, error } = await supabase.storage.from('photos').download(path);
  if (error || !data) {
    console.error('[id-card] photo download failed:', error?.message, path);
    return null;
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const base64 = buffer.toString('base64');
  const mime = path.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${base64}`;
}
