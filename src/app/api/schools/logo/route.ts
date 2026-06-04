import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest, sessionHasRole } from '@/lib/session';
import { resolveLogoMime, uploadSchoolLogoBuffer } from '@/lib/storage/upload-school-logo';

export const dynamic = 'force-dynamic';

function canEditLogo(
  session: NonNullable<ReturnType<typeof getSessionFromRequest>>,
  schoolId: string
): boolean {
  if (sessionHasRole(session, 'super_admin')) return true;
  return session.roles.some(
    (r) => r.role === 'school_admin' && r.school_id === schoolId
  );
}

/** POST multipart: school_id + file */
export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const formData = await request.formData();
    const schoolId = formData.get('school_id') as string | null;
    const file = formData.get('file') as File | null;

    if (!schoolId) return NextResponse.json({ error: 'school_id required' }, { status: 400 });
    if (!file?.size) return NextResponse.json({ error: 'No image file' }, { status: 400 });

    if (!canEditLogo(session, schoolId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const mime = resolveLogoMime(file.type || '', file.name);
    if (!mime) {
      return NextResponse.json(
        { error: 'Logo must be JPG, PNG, or WebP (max 5 MB). HEIC and other formats are not supported.' },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();
    const buffer = Buffer.from(await file.arrayBuffer());
    const { path, error: uploadErr } = await uploadSchoolLogoBuffer(
      supabase,
      schoolId,
      buffer,
      mime,
      file.name
    );

    if (!path) {
      return NextResponse.json({ error: uploadErr || 'Upload failed' }, { status: 500 });
    }

    const { error: dbErr } = await supabase
      .from('schools')
      .update({ logo_url: path })
      .eq('id', schoolId);

    if (dbErr) {
      return NextResponse.json({ error: dbErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      path,
      preview_url: `/api/photo?path=${encodeURIComponent(path)}`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.error('[schools/logo]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
