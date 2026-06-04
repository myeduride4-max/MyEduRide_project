import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** GET /api/public/school-branding?school_id=... */
export async function GET(request: NextRequest) {
  try {
    const schoolId = request.nextUrl.searchParams.get('school_id');
    if (!schoolId) return NextResponse.json({ error: 'school_id required' }, { status: 400 });

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('schools')
      .select('id, name, logo_url, welcome_message')
      .eq('id', schoolId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'School not found' }, { status: 404 });

    return NextResponse.json({
      school: {
        id: data.id,
        name: data.name,
        logo_url: data.logo_url,
        welcome_message: data.welcome_message,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
