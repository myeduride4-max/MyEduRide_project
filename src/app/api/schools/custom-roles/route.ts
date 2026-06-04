import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest, sessionHasRole } from '@/lib/session';
import { fetchCustomRoles, getCustomRole, slugifyRoleName } from '@/lib/staff/custom-roles';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const schoolId = request.nextUrl.searchParams.get('school_id');
    if (!schoolId) return NextResponse.json({ error: 'school_id required' }, { status: 400 });

    const allowed = session.roles.some(
      (r) =>
        r.school_id === schoolId &&
        ['school_admin', 'teacher', 'gate_officer', 'staff'].includes(r.role)
    );
    if (!allowed && !sessionHasRole(session, 'super_admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const supabase = getAdminClient();
    const roles = await fetchCustomRoles(supabase, schoolId);
    return NextResponse.json({ roles });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await request.json();
    const { school_id, name, can_assign_class } = body;

    if (!school_id || !name?.trim()) {
      return NextResponse.json({ error: 'school_id and name required' }, { status: 400 });
    }

    const isAdmin = session.roles.some(
      (r) => r.school_id === school_id && r.role === 'school_admin'
    );
    if (!isAdmin && !sessionHasRole(session, 'super_admin')) {
      return NextResponse.json({ error: 'School admin only' }, { status: 403 });
    }

    const supabase = getAdminClient();
    let slug = slugifyRoleName(name);
    const existing = await fetchCustomRoles(supabase, school_id);
    if (existing.some((r) => r.slug === slug)) {
      slug = `${slug}_${Date.now().toString(36).slice(-4)}`;
    }

    const { data, error } = await supabase
      .from('school_custom_roles')
      .insert({
        school_id,
        name: name.trim(),
        slug,
        can_assign_class: !!can_assign_class,
        sort_order: existing.length,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ role: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const roleId = request.nextUrl.searchParams.get('id');
    const schoolId = request.nextUrl.searchParams.get('school_id');
    if (!roleId || !schoolId) {
      return NextResponse.json({ error: 'id and school_id required' }, { status: 400 });
    }

    const isAdmin = session.roles.some(
      (r) => r.school_id === schoolId && r.role === 'school_admin'
    );
    if (!isAdmin && !sessionHasRole(session, 'super_admin')) {
      return NextResponse.json({ error: 'School admin only' }, { status: 403 });
    }

    const supabase = getAdminClient();
    const role = await getCustomRole(supabase, roleId, schoolId);
    if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 });

    const { error } = await supabase
      .from('school_custom_roles')
      .update({ is_active: false })
      .eq('id', roleId)
      .eq('school_id', schoolId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
