import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest, sessionHasRole } from '@/lib/session';

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
  if (!session || !sessionHasRole(session, 'super_admin')) {
    return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
  }

  try {
    const supabase = getAdminClient();
    const authById = new Map<string, { password: string }>();

    let page = 1;
    const perPage = 1000;
    while (page <= 20) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      for (const user of data.users) {
        authById.set(user.id, {
          password: (user.user_metadata?.login_password as string) || '',
        });
      }

      if (data.users.length < perPage) break;
      page += 1;
    }

    const { data: profiles, error: profilesErr } = await supabase
      .from('user_profiles')
      .select('id, username, email, full_name')
      .order('username');

    if (profilesErr) {
      return NextResponse.json({ error: profilesErr.message }, { status: 500 });
    }

    const ids = (profiles || []).map((p) => p.id);
    if (ids.length === 0) {
      return NextResponse.json({ users: [] });
    }

    const { data: roles } = await supabase
      .from('user_school_roles')
      .select('user_id, role')
      .in('user_id', ids)
      .eq('is_active', true);

    const roleMap = new Map<string, Set<string>>();
    for (const role of roles || []) {
      if (!roleMap.has(role.user_id)) roleMap.set(role.user_id, new Set<string>());
      roleMap.get(role.user_id)!.add(role.role);
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
