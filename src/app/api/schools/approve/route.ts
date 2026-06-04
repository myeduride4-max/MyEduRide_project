import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest, sessionHasRole } from '@/lib/session';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

const resend = new Resend(process.env.RESEND_API_KEY);

/** POST — super admin approves or rejects a pending school. */
export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session || !sessionHasRole(session, 'super_admin')) {
      return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
    }

    const { school_id, action } = await request.json();
    if (!school_id) {
      return NextResponse.json({ error: 'school_id is required' }, { status: 400 });
    }

    const status = action === 'reject' ? 'rejected' : 'approved';
    const supabase = getAdminClient();

    const { data: school, error } = await supabase
      .from('schools')
      .update({ approval_status: status })
      .eq('id', school_id)
      .select('id, name, approval_status')
      .single();

    if (error || !school) {
      return NextResponse.json({ error: error?.message || 'School not found' }, { status: 404 });
    }

    if (status === 'approved') {
      const { data: adminRole } = await supabase
        .from('user_school_roles')
        .select('user_id')
        .eq('school_id', school_id)
        .eq('role', 'school_admin')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (adminRole?.user_id) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('full_name, email, username')
          .eq('id', adminRole.user_id)
          .maybeSingle();

        if (profile?.email) {
          try {
            await resend.emails.send({
              from: 'MyEduRide <noreply@assetid.site>',
              to: profile.email,
              subject: `Your school "${school.name}" has been approved`,
              html: `
              <div style="font-family: sans-serif; max-width: 480px;">
                <p>Hello ${profile.full_name || 'Admin'},</p>
                <p><strong>${school.name}</strong> is now approved on MyEduRide.</p>
                <p>Sign in with username <strong>${profile.username}</strong> and complete the setup wizard.</p>
                <p><a href="${process.env.NEXT_PUBLIC_APP_URL}">${process.env.NEXT_PUBLIC_APP_URL}</a></p>
              </div>
            `,
            });
          } catch (emailErr) {
            console.error('[school approve] email:', emailErr);
          }
        }
      }
    }

    return NextResponse.json({ success: true, school });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
