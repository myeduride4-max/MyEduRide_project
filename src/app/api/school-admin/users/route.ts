import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest } from '@/lib/session';

type ListedUser = {
  id: string;
  username: string;
  email: string;
  full_name: string;
  roles: string[];
  password: string;
};

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session?.user_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const schoolIds = Array.from(
    new Set(
      (session.roles || [])
        .filter((r) => r.role === 'school_admin')
        .map((r) => r.school_id)
        .filter(Boolean)
    )
  );

  if (schoolIds.length === 0) {
    return NextResponse.json({ error: 'School admin access required' }, { status: 403 });
  }

  try {
    const supabase = getAdminClient();

    const { data: scopedRoles, error: scopedRolesErr } = await supabase
      .from('user_school_roles')
      .select('user_id, role')
      .in('school_id', schoolIds)
      .eq('is_active', true);

    if (scopedRolesErr) {
      return NextResponse.json({ error: scopedRolesErr.message }, { status: 500 });
    }

    const userIds = Array.from(new Set((scopedRoles || []).map((r) => r.user_id).filter(Boolean)));
    if (userIds.length === 0) {
      return NextResponse.json({ users: [] });
    }

    const roleMap = new Map<string, Set<string>>();
    for (const row of scopedRoles || []) {
      if (!roleMap.has(row.user_id)) roleMap.set(row.user_id, new Set<string>());
      roleMap.get(row.user_id)!.add(row.role);
    }

    const { data: profiles, error: profilesErr } = await supabase
      .from('user_profiles')
      .select('id, username, email, full_name')
      .in('id', userIds);

    if (profilesErr) {
      return NextResponse.json({ error: profilesErr.message }, { status: 500 });
    }

    const authById = new Map<string, { password: string }>();
    let page = 1;
    const perPage = 1000;
    while (page <= 20) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      for (const user of data.users) {
        if (!userIds.includes(user.id)) continue;
        authById.set(user.id, {
          password: (user.user_metadata?.login_password as string) || '',
        });
      }

      if (data.users.length < perPage) break;
      page += 1;
    }

    const users: ListedUser[] = (profiles || [])
      .map((p) => ({
        id: p.id,
        username: p.username || '',
        email: p.email || '',
        full_name: p.full_name || '',
        roles: Array.from(roleMap.get(p.id) || []),
        password: authById.get(p.id)?.password || '',
      }))
      .sort((a, b) => a.username.localeCompare(b.username));

    return NextResponse.json({ users });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load users' }, { status: 500 });
  }
}
