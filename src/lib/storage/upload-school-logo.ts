import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'photos';

const ALLOWED_LOGO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function extFromMime(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  return 'jpg';
}

/** Browsers (esp. Windows) often leave file.type empty for valid images. */
export function resolveLogoMime(contentType: string, filename?: string): string | null {
  const mime = (contentType || '').toLowerCase().trim();
  if (mime && ALLOWED_LOGO_TYPES.has(mime)) return mime;

  const name = (filename || '').toLowerCase();
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';

  return null;
}

export function isAllowedLogoMime(mime: string): boolean {
  return ALLOWED_LOGO_TYPES.has(mime.toLowerCase());
}

export function resolveLogoMimeFromFile(file: Pick<File, 'type' | 'name'>): string | null {
  return resolveLogoMime(file.type || '', file.name);
}

/** Upload school logo; store storage path in schools.logo_url (works with /api/photo). */
export async function uploadSchoolLogoBuffer(
  supabase: SupabaseClient,
  schoolId: string,
  buffer: Buffer,
  contentType: string,
  filename?: string
): Promise<{ path: string | null; error: string | null }> {
  const resolved = resolveLogoMime(contentType, filename);
  if (!resolved) {
    return { path: null, error: 'Logo must be JPG, PNG, or WebP' };
  }
  const ext = extFromMime(resolved);
  const storagePath = `logos/${schoolId}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: resolved, upsert: true });

  if (error) {
    console.error('[upload-school-logo]', error.message);
    return { path: null, error: error.message };
  }

  return { path: storagePath, error: null };
}

/** Upload principal/director signature image for ID cards. */
export async function uploadSchoolSignatureBuffer(
  supabase: SupabaseClient,
  schoolId: string,
  buffer: Buffer,
  contentType: string,
  filename?: string
): Promise<{ path: string | null; error: string | null }> {
  const resolved = resolveLogoMime(contentType, filename);
  if (!resolved) {
    return { path: null, error: 'Signature must be JPG, PNG, or WebP' };
  }
  const ext = extFromMime(resolved);
  const storagePath = `signatures/${schoolId}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: resolved, upsert: true });

  if (error) {
    console.error('[upload-school-signature]', error.message);
    return { path: null, error: error.message };
  }
  return { path: storagePath, error: null };
}
