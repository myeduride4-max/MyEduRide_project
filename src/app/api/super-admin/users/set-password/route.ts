import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { validatePasswordPair } from '@/lib/auth/password-policy';
import { setAuthPasswordForProfile } from '@/lib/auth/update-password';
import { getSessionFromRequest, sessionHasRole } from '@/lib/session';

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session || !sessionHasRole(session, 'super_admin')) {
    return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const userId = (body.user_id || '').trim();
    const password = (body.password || '').trim();
    const confirmPassword = (body.confirm_password || '').trim();

    if (!userId) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }

    const pwErr = validatePasswordPair(password, confirmPassword);
    if (pwErr) {
      return NextResponse.json({ error: pwErr }, { status: 400 });
    }

    const supabase = getAdminClient();
    const { error } = await setAuthPasswordForProfile(supabase, userId, password, {
      createAuthIfMissing: true,
    });

    if (error) {
      const status = error === 'User not found' ? 404 : 500;
      return NextResponse.json({ error }, { status });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not update password' }, { status: 500 });
  }
}
