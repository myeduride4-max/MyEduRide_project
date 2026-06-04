import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminClient } from '@/lib/supabase/admin';
import { changeUsernameForProfile } from '@/lib/auth/change-username';
import { setAuthPasswordForProfile } from '@/lib/auth/update-password';
import { validatePasswordPair } from '@/lib/auth/password-policy';
import { getSessionFromRequest } from '@/lib/session';
import { authEmailFromUsername, normalizeUsername } from '@/lib/auth/username';

function getPublicSupabaseClient() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  url = url.replace(/\/rest\/v1\/?.*$/, '').replace(/\/$/, '');
  return createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function verifyCurrentPassword(username: string, currentPassword: string): Promise<boolean> {
  const authEmail = authEmailFromUsername(username);
  const authClient = getPublicSupabaseClient();
  const { error } = await authClient.auth.signInWithPassword({
    email: authEmail,
    password: currentPassword,
  });
  await authClient.auth.signOut();
  return !error;
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session?.user_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getAdminClient();
    const body = await request.json();

    const currentPassword = (body.current_password || '').trim();
    const newUsernameRaw = (body.new_username || '').trim();
    const newPassword = (body.new_password || '').trim();
    const confirmPassword = (body.confirm_password || newPassword).trim();

    if (!currentPassword) {
      return NextResponse.json({ error: 'Current password is required' }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('username')
      .eq('id', session.user_id)
      .maybeSingle();

    const loginUsername = profile?.username || session.username;
    if (!loginUsername) {
      return NextResponse.json({ error: 'Username not found on account' }, { status: 400 });
    }

    const wantsUsernameChange =
      !!newUsernameRaw &&
      normalizeUsername(newUsernameRaw) !== normalizeUsername(loginUsername);
    const wantsPasswordChange = !!newPassword;

    if (!wantsUsernameChange && !wantsPasswordChange) {
      return NextResponse.json({ error: 'Enter a new username and/or new password' }, { status: 400 });
    }

    const passwordOk = await verifyCurrentPassword(loginUsername, currentPassword);
    if (!passwordOk) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
    }

    let updatedUsername = loginUsername;

    if (wantsUsernameChange) {
      const usernameResult = await changeUsernameForProfile(
        supabase,
        session.user_id,
        newUsernameRaw
      );
      if ('error' in usernameResult) {
        return NextResponse.json({ error: usernameResult.error }, { status: 400 });
      }
      updatedUsername = usernameResult.username;
    }

    if (wantsPasswordChange) {
      if (newPassword === currentPassword) {
        return NextResponse.json(
          { error: 'New password must be different from current password' },
          { status: 400 }
        );
      }
      const pwErr = validatePasswordPair(newPassword, confirmPassword);
      if (pwErr) {
        return NextResponse.json({ error: pwErr }, { status: 400 });
      }

      const { error: updateErr } = await setAuthPasswordForProfile(
        supabase,
        session.user_id,
        newPassword
      );
      if (updateErr) {
        return NextResponse.json({ error: updateErr }, { status: 500 });
      }
    }

    const sessionPayload = {
      ...session,
      username: updatedUsername,
    };

    const response = NextResponse.json({
      success: true,
      username: updatedUsername,
      password_updated: wantsPasswordChange,
      username_updated: wantsUsernameChange,
    });

    response.cookies.set('myeduride_session', JSON.stringify(sessionPayload), {
      httpOnly: false,
      secure: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not update account';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
