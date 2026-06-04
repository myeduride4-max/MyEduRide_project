import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** GET /api/notifications/inbox?school_id=xxx&limit=50 */
export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const schoolId = request.nextUrl.searchParams.get('school_id');
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50', 10), 100);

    const supabase = getAdminClient();
    let query = supabase
      .from('notifications')
      .select('*, student:students(first_name, last_name)')
      .eq('user_id', session.user_id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (schoolId) query = query.eq('school_id', schoolId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const unread = (data || []).filter((n) => !n.is_read).length;
    return NextResponse.json({ notifications: data || [], unread_count: unread });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PATCH /api/notifications/inbox  body: { id } | { mark_all: true, school_id? } */
export async function PATCH(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await request.json();
    const supabase = getAdminClient();

    if (body.mark_all) {
      let q = supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', session.user_id)
        .eq('is_read', false);
      if (body.school_id) q = q.eq('school_id', body.school_id);
      await q;
      return NextResponse.json({ success: true });
    }

    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', body.id)
      .eq('user_id', session.user_id);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
