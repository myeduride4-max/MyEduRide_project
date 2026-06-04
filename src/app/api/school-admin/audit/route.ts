import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest, sessionHasRole } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** GET /api/school-admin/audit?school_id=&limit=100 */
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const schoolId = request.nextUrl.searchParams.get('school_id');
  if (!schoolId) return NextResponse.json({ error: 'school_id required' }, { status: 400 });

  const allowed =
    sessionHasRole(session, 'super_admin') ||
    session.roles.some((r) => r.school_id === schoolId && r.role === 'school_admin');
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '100', 10), 200);
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, action, entity_type, entity_id, details, created_at, actor_user_id')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(limit);

  const actorIds = [...new Set((data || []).map((r) => r.actor_user_id).filter(Boolean))];
  const nameById: Record<string, string> = {};
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name')
      .in('id', actorIds);
    for (const p of profiles || []) {
      nameById[p.id] = p.full_name;
    }
  }

  const logs = (data || []).map((row) => ({
    ...row,
    actor: row.actor_user_id ? { full_name: nameById[row.actor_user_id] || 'User' } : null,
  }));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ logs });
}
