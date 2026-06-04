import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminClient } from '@/lib/supabase/admin';
import { resolveAuthUserForProfile, setAuthPasswordForProfile } from '@/lib/auth/update-password';
import { getSessionFromRequest } from '@/lib/session';
import { authEmailFromUsername } from '@/lib/auth/username';

function getPublicSupabaseClient() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  url = url.replace(/\/rest\/v1\/?.*$/, '').replace(/\/$/, '');
  return createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session?.user_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getAdminClient();
    let username = session.username;
    if (!username) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('username')
        .eq('id', session.user_id)
        .maybeSingle();
      username = profile?.username || '';
    }
    if (!username) {
      return NextResponse.json({ error: 'Username not found on account' }, { status: 400 });
    }
    const body = await request.json();
    const currentPassword = (body.current_password || '').trim();
    const newPassword = (body.new_password || '').trim();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Current password and new password are required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'New password must be at least 6 characters' },
        { status: 400 }
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: 'New password must be different from current password' },
        { status: 400 }
      );
    }

    const authEmail = authEmailFromUsername(username);
    const authClient = getPublicSupabaseClient();
    const { error: signInError } = await authClient.auth.signInWithPassword({
      email: authEmail,
      password: currentPassword,
    });

    if (signInError) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
    }

    await authClient.auth.signOut();

    const resolved = await resolveAuthUserForProfile(supabase, session.user_id);
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: 404 });
    }

    const { error: updateErr } = await setAuthPasswordForProfile(
      supabase,
      session.user_id,
      newPassword
    );

    if (updateErr) {
      return NextResponse.json({ error: updateErr }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Could not change password' }, { status: 500 });
  }
}
