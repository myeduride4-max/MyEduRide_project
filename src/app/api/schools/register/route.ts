import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { validatePasswordPair } from '@/lib/auth/password-policy';
import { provisionSchool } from '@/lib/school/provision-school';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

const resend = new Resend(process.env.RESEND_API_KEY);

/** Public — school self-registration (auto-approved, same as super-admin create). */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      address,
      admin_username,
      admin_name,
      admin_phone,
      admin_email,
      admin_password,
      confirm_password,
    } = body;

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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';

    if (normalizedEmail && process.env.RESEND_API_KEY) {
      try {
        await resend.emails.send({
          from: 'MyEduRide <noreply@assetid.site>',
          to: normalizedEmail,
          subject: `Welcome — ${name.trim()} is ready on MyEduRide`,
          html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <p>Hello ${admin_name},</p>
            <p>Your school <strong>${name.trim()}</strong> is registered and active on MyEduRide.</p>
            <p><strong>Username:</strong> ${result.admin_username}</p>
            <p>Sign in with the password you chose and complete the setup wizard (classes, staff, students).</p>
            ${appUrl ? `<p><a href="${appUrl}/auth/login">Sign in to MyEduRide</a></p>` : ''}
            <p style="color:#666;font-size:12px;">MyEduRide — The Student Safety Platform</p>
          </div>
        `,
        });
      } catch (emailErr) {
        console.error('[school register] email:', emailErr);
      }
    }

    return NextResponse.json({
      success: true,
      approved: true,
      school_id: result.school.id,
      admin_username: result.admin_username,
      message: 'Your school is registered. Sign in now to complete setup.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
