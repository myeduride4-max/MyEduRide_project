import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest, sessionHasRole } from '@/lib/session';
import { assertTeacherStudentAccess } from '@/lib/attendance/teacher-access';
import { Resend } from 'resend';
import { sendPushToUser } from '@/lib/push/send';
import { todayInLagos } from '@/lib/timezone';
import { fetchStudentPickupContext } from '@/lib/gate/student-pickup-context';
import { getParentRecipientsForStudent } from '@/lib/notifications/parent-recipients';

export const dynamic = 'force-dynamic';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * POST /api/teacher/ready-for-pickup
 * Teacher marks a student as ready for pickup.
 * - Creates a dismissal_request (unique per student per day → prevents double-tap)
 * - Notifies parents via push + email
 * - Notifies gate officers
 */
export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { student_id, school_id, notes } = await request.json();
    if (!student_id || !school_id) {
      return NextResponse.json({ error: 'student_id and school_id required' }, { status: 400 });
    }

    const isTeacher = session.roles.some(
      (r) => r.school_id === school_id && ['teacher', 'school_admin'].includes(r.role)
    );
    if (!isTeacher && !sessionHasRole(session, 'super_admin')) {
      return NextResponse.json({ error: 'Teacher access required' }, { status: 403 });
    }

    const supabase = getAdminClient();
    const access = await assertTeacherStudentAccess(supabase, session, school_id, student_id);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const today = todayInLagos();

    // Check if already marked ready today (prevent double-tap)
    const { data: existing } = await supabase
      .from('dismissal_requests')
      .select('id, status')
      .eq('student_id', student_id)
      .eq('dismissal_date', today)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'Student already marked ready for pickup today', existing },
        { status: 409 }
      );
    }

    // Also remove from extra_lessons if they were in one
    await supabase
      .from('extra_lessons')
      .update({ is_released: true, released_at: new Date().toISOString() })
      .eq('student_id', student_id)
      .eq('date', today)
      .eq('is_released', false);

    // Create dismissal request
    const { data: dismissal, error: dismissErr } = await supabase
      .from('dismissal_requests')
      .insert({
        student_id,
        school_id,
        requested_by_user_id: session.user_id,
        status: 'pending',
        notes: notes || null,
        dismissal_date: today,
      })
      .select()
      .single();

    if (dismissErr) {
      // Unique constraint violation = already exists
      if (dismissErr.code === '23505') {
        return NextResponse.json(
          { error: 'Student already marked ready for pickup today' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: dismissErr.message }, { status: 500 });
    }

    // Get student + school info for notifications
    const { data: student } = await supabase
      .from('students')
      .select('*, school:schools(name, logo_url, primary_color)')
      .eq('id', student_id)
      .single();

    if (!student) {
      return NextResponse.json({ success: true, dismissal });
    }

    const school = Array.isArray(student.school) ? student.school[0] : student.school;
    const schoolName = school?.name || 'School';
    const schoolColor = school?.primary_color || '#1B4D3E';
    const timeStr = new Date().toLocaleTimeString('en-NG', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Africa/Lagos',
    });

    const pickupCtx = await fetchStudentPickupContext(supabase, school_id, student_id, today);
    const pickupName =
      (pickupCtx.pickup_notice?.pickup_person_name as string) ||
      (pickupCtx.pickup_request?.pickup_person_name as string) ||
      pickupCtx.pickup_persons[0]?.name ||
      null;
    const pickupPhone =
      (pickupCtx.pickup_notice?.pickup_person_phone as string) ||
      (pickupCtx.pickup_request?.pickup_person_phone as string) ||
      pickupCtx.pickup_persons[0]?.phone ||
      null;

    const title = `${student.first_name} is ready for pickup`;
    const pickupLine = pickupName
      ? `Expected pickup: ${pickupName}${pickupPhone ? ` (${pickupPhone})` : ''}.`
      : 'Please come to the gate to collect your child.';
    const message = `${student.first_name} ${student.last_name} has been dismissed at ${schoolName}. ${pickupLine}`;

    const emailHtml = `
      <div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;">
        <div style="background:${schoolColor};padding:20px;text-align:center;border-radius:12px 12px 0 0;">
          <h2 style="color:white;margin:0;font-size:16px;">${schoolName}</h2>
        </div>
        <div style="padding:24px;background:white;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
          <div style="text-align:center;margin-bottom:16px;">
            <span style="font-size:40px;">🚗</span>
          </div>
          <h3 style="text-align:center;color:#1f2937;margin:0 0 16px;">Ready for Pickup</h3>
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin-bottom:16px;">
            <p style="margin:4px 0;color:#374151;"><strong>Student:</strong> ${student.first_name} ${student.last_name}</p>
            <p style="margin:4px 0;color:#374151;"><strong>Time:</strong> ${timeStr}</p>
            ${pickupName ? `<p style="margin:4px 0;color:#374151;"><strong>Authorised pickup:</strong> ${pickupName}${pickupPhone ? ` · ${pickupPhone}` : ''}</p>` : ''}
            ${notes ? `<p style="margin:4px 0;color:#374151;"><strong>Note:</strong> ${notes}</p>` : ''}
          </div>
          <p style="text-align:center;color:#6b7280;font-size:13px;">
            Your child will be released at the gate once the authorised pickup person is verified.
          </p>
          <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:20px;">MyEduRide</p>
        </div>
      </div>
    `;

    const parents = await getParentRecipientsForStudent(supabase, student_id);

    for (const parent of parents) {
      let emailSent = false;
      if (parent.email && process.env.RESEND_API_KEY) {
        try {
          await resend.emails.send({
            from: `${schoolName} via MyEduRide <noreply@assetid.site>`,
            to: parent.email,
            subject: `🚗 ${student.first_name} is ready for pickup`,
            html: emailHtml,
          });
          emailSent = true;
        } catch (e) {
          console.error('[ready-for-pickup] email failed:', parent.email, e);
        }
      } else if (!parent.email) {
        console.warn('[ready-for-pickup] no email for parent of student', student_id);
      }

      if (parent.user_id) {
        try {
          await sendPushToUser(supabase, parent.user_id, {
            title,
            message,
            type: 'dismissal',
            student_id: student.id,
            url: '/dashboard/parent',
            tag: `dismissal-${student.id}-${today}`,
          });
        } catch (e) {
          console.error('[ready-for-pickup] push failed:', e);
        }

        await supabase.from('notifications').insert({
          user_id: parent.user_id,
          school_id,
          student_id,
          title,
          message,
          type: 'dismissal',
          is_read: false,
          email_sent: emailSent,
          push_sent: true,
        });
      }
    }

    // Notify gate officers
    const { data: gateRoles } = await supabase
      .from('user_school_roles')
      .select('user_id')
      .eq('school_id', school_id)
      .eq('role', 'gate_officer')
      .eq('is_active', true);

    for (const gate of gateRoles || []) {
      await supabase.from('notifications').insert({
        user_id: gate.user_id,
        school_id,
        student_id,
        title: `Ready for pickup: ${student.first_name} ${student.last_name}`,
        message: `${student.first_name} ${student.last_name} is ready for pickup at ${timeStr}`,
        type: 'dismissal',
        is_read: false,
      });
    }

    return NextResponse.json({ success: true, dismissal });
  } catch (err: any) {
    console.error('[ready-for-pickup]', err);
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}
