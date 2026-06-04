import { getAdminClient } from '@/lib/supabase/admin';
import { Resend } from 'resend';
import { sendPushToUser } from '@/lib/push/send';
import { formatDateLagos, formatTimeLagos } from '@/lib/timezone';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function notifyParentsOfAttendance(params: {
  student_id: string;
  attendance_record_id: string;
  type: 'arrival' | 'departure';
}): Promise<{ notified: number; skipped?: string }> {
  const { student_id, attendance_record_id, type } = params;
  const supabase = getAdminClient();

  const { data: student, error: studentErr } = await supabase
    .from('students')
    .select('*, school:schools(name, logo_url, primary_color), class:school_classes(name)')
    .eq('id', student_id)
    .single();

  if (studentErr || !student) {
    return { notified: 0, skipped: 'Student not found' };
  }

  const { data: record } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('id', attendance_record_id)
    .single();

  if (!record) {
    return { notified: 0, skipped: 'Attendance record not found' };
  }

  const { data: parentLinks } = await supabase
    .from('student_parents')
    .select('parent_user_id')
    .eq('student_id', student_id);

  if (!parentLinks?.length) {
    return { notified: 0, skipped: 'No parents linked to this student' };
  }

  const parentIds = parentLinks.map((l) => l.parent_user_id);
  const { data: parents } = await supabase
    .from('user_profiles')
    .select('id, email, full_name')
    .in('id', parentIds);

  if (!parents?.length) {
    return { notified: 0, skipped: 'Parent profiles not found' };
  }

  const school = Array.isArray(student.school) ? student.school[0] : student.school;
  const schoolClass = Array.isArray(student.class) ? student.class[0] : student.class;
  const schoolName = school?.name || 'School';
  const schoolColor = school?.primary_color || '#1B4D3E';
  const className = schoolClass?.name || '—';

  const timeStr = formatTimeLagos(record.timestamp);
  const dateStr = formatDateLagos(record.timestamp);

  const notifType = record.status === 'late' && type === 'arrival' ? 'late' : type;

  const title =
    notifType === 'late'
      ? `${student.first_name} arrived late`
      : type === 'arrival'
        ? `${student.first_name} arrived at school`
        : `${student.first_name} left school`;

  const shortMessage =
    notifType === 'late'
      ? `${student.first_name} arrived late at ${schoolName} at ${timeStr}`
      : type === 'arrival'
        ? `${student.first_name} arrived at ${schoolName} at ${timeStr}`
        : `${student.first_name} left ${schoolName} at ${timeStr}`;

  const emailHtml = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
      <div style="background: ${schoolColor}; padding: 20px; text-align: center; border-radius: 12px 12px 0 0;">
        <h2 style="color: white; margin: 0; font-size: 16px;">${schoolName}</h2>
      </div>
      <div style="padding: 24px; background: white; border: 1px solid #e5e7eb;">
        <h3 style="color: #1f2937;">${title}</h3>
        <p><strong>Student:</strong> ${student.first_name} ${student.last_name}</p>
        <p><strong>Class:</strong> ${className}</p>
        <p><strong>Time:</strong> ${timeStr} on ${dateStr}</p>
        ${record.status === 'late' ? '<p style="color:#dc2626;"><strong>Status:</strong> Late</p>' : ''}
        <p style="color:#9ca3af;font-size:12px;margin-top:16px;">MyEduRide — Parent notification</p>
      </div>
    </div>
  `;

  let notified = 0;

  for (const parent of parents) {
    let emailSent = false;
    let pushSent = false;

    try {
      if (process.env.RESEND_API_KEY) {
        await resend.emails.send({
          from: `${schoolName} via MyEduRide <noreply@assetid.site>`,
          to: parent.email,
          subject: title,
          html: emailHtml,
        });
        emailSent = true;
      }
    } catch (emailErr) {
      console.error('[notify] email failed:', emailErr);
    }

    try {
      const pushResult = await sendPushToUser(supabase, parent.id, {
        title,
        message: shortMessage,
        type: notifType as 'arrival' | 'departure' | 'late',
        student_id: student.id,
        url: '/dashboard/parent',
        tag: `attendance-${student.id}-${type}`,
      });
      pushSent = pushResult.sent > 0;
    } catch (pushErr) {
      console.error('[notify] push failed:', pushErr);
    }

    const { error: insertErr } = await supabase.from('notifications').insert({
      user_id: parent.id,
      school_id: student.school_id,
      student_id: student.id,
      title,
      message: shortMessage,
      type: notifType,
      is_read: false,
      email_sent: emailSent,
      push_sent: pushSent,
    });

    if (!insertErr) notified++;
  }

  return { notified };
}
