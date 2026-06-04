import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminClient } from '@/lib/supabase/admin';
import { ensureSuperAdminAccess } from '@/lib/auth/ensure-super-admin';
import { isSuperAdminUsername } from '@/lib/auth/super-admin';
import { findProfileByUsername } from '@/lib/auth/ensure-user';
import { authEmailFromUsername, isValidUsername, normalizeUsername } from '@/lib/auth/username';
import { writeAuditLog } from '@/lib/audit/log';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function getPublicSupabaseClient() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  url = url.replace(/\/rest\/v1\/?.*$/, '').replace(/\/$/, '');
  return createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = normalizeUsername(body.username || '');
    const password = (body.password || '').trim();
    const loginSchoolId = (body.school_id || '').trim() || null;

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    if (!isValidUsername(username)) {
      return NextResponse.json({ error: 'Invalid username format' }, { status: 400 });
    }

    const supabase = getAdminClient();

    if (isSuperAdminUsername(username)) {
      const boot = await ensureSuperAdminAccess(supabase, username);
      if (!boot.ok) {
        console.error('[login] super admin bootstrap:', boot.error);
      }
    }

    const { data: profile } = await findProfileByUsername(supabase, username);

    if (!profile) {
      await writeAuditLog(supabase, {
        actor_user_id: '00000000-0000-0000-0000-000000000000',
        action: 'login_failed_unknown_user',
        details: { username },
      }).catch(() => {});
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    if (profile.locked_until && new Date(profile.locked_until) > new Date()) {
      return NextResponse.json(
        { error: 'Account is locked. Try again later.' },
        { status: 423 }
      );
    }

    const authClient = getPublicSupabaseClient();
    const authEmail = authEmailFromUsername(profile.username || username);
    const { error: signInError } = await authClient.auth.signInWithPassword({
      email: authEmail,
      password,
    });

    if (signInError) {
      const nextAttempts = (profile.failed_login_attempts || 0) + 1;
      const isLocked = nextAttempts >= MAX_FAILED_ATTEMPTS;

      await supabase
        .from('user_profiles')
        .update({
          failed_login_attempts: nextAttempts,
          locked_until: isLocked
            ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
            : null,
        })
        .eq('id', profile.id);

      const schoolId = (
        await supabase
          .from('user_school_roles')
          .select('school_id')
          .eq('user_id', profile.id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle()
      ).data?.school_id;

      await writeAuditLog(supabase, {
        school_id: schoolId,
        actor_user_id: profile.id,
        action: isLocked ? 'login_locked' : 'login_failed',
        details: { attempts: nextAttempts },
      });

      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    await authClient.auth.signOut();

    await supabase
      .from('user_profiles')
      .update({
        failed_login_attempts: 0,
        locked_until: null,
        auth_preference: 'password',
      })
      .eq('id', profile.id);

    const { data: roles } = await supabase
      .from('user_school_roles')
      .select('role, school_id')
      .eq('user_id', profile.id)
      .eq('is_active', true);

    if (loginSchoolId) {
      const isSuperAdmin = (roles || []).some((r) => r.role === 'super_admin');
      const belongsToSchool = (roles || []).some((r) => r.school_id === loginSchoolId);
      if (!belongsToSchool && !isSuperAdmin) {
        await writeAuditLog(supabase, {
          school_id: loginSchoolId,
          actor_user_id: profile.id,
          action: 'login_failed_wrong_school',
          details: { username },
        }).catch(() => {});

        return NextResponse.json(
          {
            error:
              'You do not have an account at this school. Use your school\'s sign-in link or contact your administrator.',
          },
          { status: 403 }
        );
      }
    }

    const adminSchoolIds = (roles || [])
      .filter((r) => r.role === 'school_admin')
      .map((r) => r.school_id)
      .filter(Boolean);

    if (adminSchoolIds.length > 0) {
      const { data: adminSchools } = await supabase
        .from('schools')
        .select('id, name, approval_status')
        .in('id', adminSchoolIds);

      const pending = (adminSchools || []).filter((s) => s.approval_status === 'pending');
      if (pending.length > 0) {
        return NextResponse.json(
          {
            error: `Your school registration (${pending[0].name}) is pending approval. You can sign in after a platform administrator approves it.`,
          },
          { status: 403 }
        );
      }

      const rejected = (adminSchools || []).filter((s) => s.approval_status === 'rejected');
      if (rejected.length === adminSchoolIds.length) {
        return NextResponse.json(
          {
            error: 'Your school registration was not approved. Please contact MyEduRide support.',
          },
          { status: 403 }
        );
      }
    }

    const schoolRole =
      (roles || []).find((r) => r.role === 'school_admin') ||
      (roles || []).find((r) => r.role === 'parent') ||
      (roles || []).find((r) => r.role === 'gate_officer') ||
      (roles || []).find((r) => r.role === 'teacher') ||
      (roles || [])[0];

    let primarySchool: {
      id: string;
      name: string;
      logo_url: string | null;
      welcome_message: string | null;
    } | null = null;

    if (schoolRole?.school_id) {
      const { data: school } = await supabase
        .from('schools')
        .select('id, name, logo_url, welcome_message')
        .eq('id', schoolRole.school_id)
        .maybeSingle();
      if (school) {
        primarySchool = {
          id: school.id,
          name: school.name,
          logo_url: school.logo_url,
          welcome_message: school.welcome_message,
        };
      }
    }

    await writeAuditLog(supabase, {
      school_id: schoolRole?.school_id || null,
      actor_user_id: profile.id,
      action: 'login_success',
      details: { roles: (roles || []).map((r) => r.role) },
    });

    const sessionData = JSON.stringify({
      user_id: profile.id,
      username: profile.username,
      email: profile.email,
      full_name: profile.full_name,
      roles: roles || [],
      primary_school: primarySchool,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: profile.id,
        username: profile.username,
        email: profile.email,
        full_name: profile.full_name,
      },
      roles: roles || [],
    });

    response.cookies.set('myeduride_session', sessionData, {
      httpOnly: false,
      secure: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return response;
  } catch (err: any) {
    console.error('Login error:', err?.message || err);
    return NextResponse.json({ error: 'Login failed.' }, { status: 500 });
  }
}
