import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest } from '@/lib/session';
import { Resend } from 'resend';
import { sendPushToUser } from '@/lib/push/send';
import { todayInLagos, nowUtcIso } from '@/lib/timezone';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    const { student_id, school_id, teacher_name } = await request.json();

    const supabase = getAdminClient();

    // Get student + school info
    const { data: student } = await supabase
      .from('students')
      .select('*, school:schools(name, logo_url, primary_color)')
      .eq('id', student_id)
      .single();

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Get teacher's name
    let teacherDisplayName = teacher_name;
    if (teacher_name && teacher_name.includes('@')) {
      const { data: teacherProfile } = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('email', teacher_name)
        .single();
      if (teacherProfile) teacherDisplayName = teacherProfile.full_name;
    }

    // Get parent user IDs
    const { data: parentLinks } = await supabase
      .from('student_parents')
      .select('parent_user_id')
      .eq('student_id', student_id);

    if (!parentLinks || parentLinks.length === 0) {
      return NextResponse.json({ message: 'No parents linked' });
    }

    const parentIds = parentLinks.map((l: any) => l.parent_user_id);
    const { data: parents } = await supabase
      .from('user_profiles')
      .select('id, email, full_name')
      .in('id', parentIds);

    if (!parents || parents.length === 0) {
      return NextResponse.json({ message: 'No parent emails found' });
    }

    const schoolColor = student.school.primary_color || '#1B4D3E';
    const schoolName = student.school.name;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const resolvedSchoolId = school_id || student.school_id;

    await supabase
      .from('dismissal_requests')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('student_id', student_id)
      .eq('school_id', resolvedSchoolId)
      .in('status', ['pending', 'approved']);

    const { error: dismissErr } = await supabase.from('dismissal_requests').insert({
      student_id,
      school_id: resolvedSchoolId,
      requested_by_user_id: session?.user_id || parentIds[0],
      status: 'pending',
      notes: `Dismissed by ${teacherDisplayName}`,
      dismissal_date: todayInLagos(),
    });

    if (dismissErr) {
      console.error('[dismissal] request insert:', dismissErr.message);
    }

    const title = `${student.first_name} is ready for pickup`;
    const message = `${student.first_name} ${student.last_name} has been dismissed by ${teacherDisplayName} at ${schoolName}. Please proceed to pick up your child.`;

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto;">
        <div style="background: ${schoolColor}; padding: 20px; text-align: center; border-radius: 12px 12px 0 0;">
          ${student.school.logo_url ? `<img src="${student.school.logo_url}" alt="${schoolName}" style="height: 40px; margin-bottom: 8px;" />` : ''}
          <h2 style="color: white; margin: 0; font-size: 16px;">${schoolName}</h2>
        </div>
        <div style="padding: 24px; background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <div style="width: 60px; height: 60px; background: #fef3c7; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
              <span style="font-size: 28px;">🚗</span>
            </div>
          </div>
          <h3 style="text-align: center; color: #1f2937; margin: 0 0 16px;">Ready for Pickup</h3>
          <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <p style="margin: 4px 0; color: #92400e; font-weight: 600;">Your child is ready to be picked up.</p>
            <p style="margin: 8px 0 4px; color: #374151;"><strong>Student:</strong> ${student.first_name} ${student.last_name}</p>
            <p style="margin: 4px 0; color: #374151;"><strong>Dismissed by:</strong> ${teacherDisplayName}</p>
            <p style="margin: 4px 0; color: #374151;"><strong>Time:</strong> ${timeStr}</p>
          </div>
          <p style="text-align: center; color: #6b7280; font-size: 13px;">
            Your child will be released at the gate once you arrive and the gate officer confirms.
          </p>
          <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 20px;">
            MyEduRide — The Student Safety Platform
          </p>
        </div>
      </div>
    `;

    for (const parent of parents) {
      // Send email
      await resend.emails.send({
        from: `${schoolName} via MyEduRide <noreply@assetid.site>`,
        to: parent.email,
        subject: `🚗 ${student.first_name} is ready for pickup`,
        html: emailHtml,
      });

      // Send push
      await sendPushToUser(supabase, parent.id, {
        title,
        message: `${student.first_name} has been dismissed. Please pick up your child.`,
        type: 'dismissal',
        student_id: student.id,
        url: '/dashboard/parent',
        tag: `dismissal-${student.id}`,
      });

      // Log notification
      await supabase.from('notifications').insert({
        user_id: parent.id,
        school_id: resolvedSchoolId,
        student_id: student.id,
        title,
        message,
        type: 'dismissal',
        is_read: false,
        email_sent: true,
        push_sent: true,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Dismissal notification error:', error);
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}


