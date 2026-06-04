import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { lookupUserByUsernameDetailed } from '@/lib/auth/lookup-user-by-username';
import type { UsernameRevealScope } from '@/lib/auth/username-school-scope';
import { getSessionFromRequest } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session?.user_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const canLookup = (session.roles || []).some((r) =>
    ['super_admin', 'school_admin', 'teacher', 'gate_officer', 'staff'].includes(r.role)
  );
  if (!canLookup) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const username = request.nextUrl.searchParams.get('username')?.trim();
  if (!username) {
    return NextResponse.json({ error: 'username required' }, { status: 400 });
  }

  const schoolId = request.nextUrl.searchParams.get('school_id')?.trim() || undefined;
  const scopeParam = request.nextUrl.searchParams.get('scope')?.trim();
  const scope: UsernameRevealScope =
    scopeParam === 'parent' || scopeParam === 'staff' || scopeParam === 'global'
      ? scopeParam
      : schoolId
        ? 'staff'
        : 'global';

  try {
    const supabase = getAdminClient();
    const result = await lookupUserByUsernameDetailed(supabase, username, {
      schoolId,
      scope,
    });

    if (result.taken) {
      return NextResponse.json({
        found: false,
        taken: true,
        user: null,
        error: 'This username is already in use.',
      });
    }

    if (!result.user) {
      return NextResponse.json({ found: false, taken: false, user: null });
    }

    return NextResponse.json({ found: true, taken: false, user: result.user });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Lookup failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
