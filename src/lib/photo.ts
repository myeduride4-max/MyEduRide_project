/** Build a same-origin URL so student photos load (works even if storage bucket is private). */

export function extractStoragePath(input: string): string | null {
  try {
    const decoded = decodeURIComponent(input);
    const publicMatch = decoded.match(/\/storage\/v1\/object\/public\/photos\/(.+)$/);
    if (publicMatch) return publicMatch[1];
    if (!decoded.includes('://') && !decoded.startsWith('/')) return decoded;
  } catch {
    return null;
  }
  return null;
}

export function photoSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  const path = extractStoragePath(url);
  if (path) return `/api/photo?path=${encodeURIComponent(path)}`;
  return `/api/photo?url=${encodeURIComponent(url)}`;
}

export async function imageUrlToDataUrl(url: string | null | undefined): Promise<string | null> {
  const src = photoSrc(url);
  if (!src) return null;
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
