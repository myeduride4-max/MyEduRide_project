import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'uploads';

    if (!file?.size) return NextResponse.json({ error: 'No file' }, { status: 400 });

    const safeName = (file.name || 'file')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80);
    const ext = safeName.includes('.') ? '' : '.jpg';
    const storagePath = `${folder}/${Date.now()}_${safeName}${ext}`;

    const supabase = getAdminClient();
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || 'application/octet-stream';

    const { error } = await supabase.storage
      .from('photos')
      .upload(storagePath, buffer, { contentType, upsert: true });

    if (error) {
      console.error('[upload]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('photos').getPublicUrl(storagePath);

    return NextResponse.json({
      success: true,
      path: storagePath,
      url: publicUrl,
      preview_url: `/api/photo?path=${encodeURIComponent(storagePath)}`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
