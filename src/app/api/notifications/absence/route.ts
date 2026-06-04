import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { Resend } from 'resend';
import { sendPushToUser } from '@/lib/push/send';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const { student_id, school_id } = await request.json();
    const supabase = createServiceRoleClient();

    const { data: student } = await supabase
      .from('students')
      .select('*, school:schools(name, primary_color, logo_url)')
      .eq('id', student_id)
      .single();

    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    const { data: parentLinks } = await supabase
      .from('student_parents')
      .select('parent_user_id')
      .eq('student_id', student_id);

    if (!parentLinks || parentLinks.length === 0) return NextResponse.json({ message: 'No parents' });

    const parentIds = parentLinks.map((l: any) => l.parent_user_id);
    const { data: parents } = await supabase
      .from('user_profiles')
      .select('id, email, full_name')
      .in('id', parentIds);

    if (!parents) return NextResponse.json({ message: 'No parents found' });

    const schoolColor = student.school.primary_color || '#1B4D3E';
    const schoolName = student.school.name;
    const title = `${student.first_name} was marked absent today`;
    const message = `${student.first_name} ${student.last_name} was not present at ${schoolName} today. Please contact the school if this is unexpected.`;

    for (const parent of parents) {
      await resend.emails.send({
        from: `${schoolName} via MyEduRide <noreply@assetid.site>`,
        to: parent.email,
        subject: title,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto;">
            <div style="background: ${schoolColor}; padding: 20px; text-align: center; border-radius: 12px 12px 0 0;">
              <h2 style="color: white; margin: 0; font-size: 16px;">${schoolName}</h2>
            </div>
            <div style="padding: 24px; background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
              <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                <p style="margin: 0; color: #991b1b; font-weight: 600;">Absence Notice</p>
                <p style="margin: 8px 0 0; color: #374151;">${student.first_name} ${student.last_name} was marked absent today at ${schoolName}.</p>
              </div>
              <p style="color: #6b7280; font-size: 13px;">If this is unexpected, please contact the school immediately.</p>
              <p style="color: #9ca3af; font-size: 12px; margin-top: 20px; text-align: center;">MyEduRide — The Student Safety Platform</p>
            </div>
          </div>
        `,
      });

      await sendPushToUser(supabase, parent.id, {
        title,
        message,
        type: 'system',
        student_id: student.id,
        url: '/dashboard/parent',
        tag: `absence-${student.id}`,
      });

      await supabase.from('notifications').insert({
        user_id: parent.id,
        school_id,
        student_id: student.id,
        title,
        message,
        type: 'system',
        is_read: false,
        email_sent: true,
        push_sent: true,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Absence notification error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}


