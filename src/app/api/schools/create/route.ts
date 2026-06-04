import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { validatePasswordPair } from '@/lib/auth/password-policy';
import { getSessionFromRequest, sessionHasRole } from '@/lib/session';
import { provisionSchool } from '@/lib/school/provision-school';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session || !sessionHasRole(session, 'super_admin')) {
      return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
    }

    const {
      name,
      address,
      logo_url,
      admin_username,
      admin_name,
      admin_phone,
      admin_email,
      admin_password,
      confirm_password,
    } = await request.json();

    if (!name?.trim() || !admin_username?.trim() || !admin_name?.trim()) {
      return NextResponse.json(
        { error: 'School name, admin username, and admin name are required' },
        { status: 400 }
      );
    }

    const pwErr = validatePasswordPair(admin_password || '', confirm_password || '');
    if (pwErr) {
      return NextResponse.json({ error: pwErr }, { status: 400 });
    }

    const supabase = getAdminClient();
    const result = await provisionSchool(supabase, {
      name: name.trim(),
      address: address || null,
      logo_url: logo_url || null,
      admin_username,
      admin_name,
      admin_phone: admin_phone || null,
      admin_email: admin_email || null,
      admin_password,
      approval_status: 'approved',
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status || 500 });
    }

    const normalizedEmail = admin_email?.trim()
      ? admin_email.toLowerCase().trim()
      : null;

    if (normalizedEmail) {
      try {
        await resend.emails.send({
          from: 'MyEduRide <noreply@assetid.site>',
          to: normalizedEmail,
          subject: `Your school "${name}" is ready to set up`,
          html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <p>Hello ${admin_name},</p>
            <p>Your school <strong>${name}</strong> has been created on MyEduRide.</p>
            <p><strong>Username:</strong> ${result.admin_username}</p>
            <p><strong>Password:</strong> ${result.admin_password}</p>
            <p>Sign in and complete the setup wizard (classes, staff, students).</p>
            <p><a href="${process.env.NEXT_PUBLIC_APP_URL}">${process.env.NEXT_PUBLIC_APP_URL}</a></p>
          </div>
        `,
        });
      } catch (emailErr) {
        console.error('Email send failed:', emailErr);
      }
    }

    return NextResponse.json({
      success: true,
      school_id: result.school.id,
      admin_username: result.admin_username,
      admin_password: result.admin_password,
      school: result.school,
    });
  } catch (error: unknown) {
    console.error('School creation error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create school';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
