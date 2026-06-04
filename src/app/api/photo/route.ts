import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

function extractStoragePath(input: string): string | null {
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

function contentTypeForPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

export async function GET(request: NextRequest) {
  try {
    const pathParam = request.nextUrl.searchParams.get('path');
    const urlParam = request.nextUrl.searchParams.get('url');
    const storagePath = pathParam || (urlParam ? extractStoragePath(urlParam) : null);

    if (!storagePath) {
      return NextResponse.json({ error: 'Invalid photo path' }, { status: 400 });
    }

    const supabase = getAdminClient();
    const { data, error } = await supabase.storage.from('photos').download(storagePath);

    if (error || !data) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const contentType = contentTypeForPath(storagePath);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
