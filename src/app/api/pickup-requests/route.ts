import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest } from '@/lib/session';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * GET /api/pickup-requests?school_id=xxx&date=YYYY-MM-DD
 * Admin/gate: list pickup requests for a school on a given date.
 */
export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const schoolId = request.nextUrl.searchParams.get('school_id');
    const date = request.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];

    if (!schoolId) return NextResponse.json({ error: 'school_id required' }, { status: 400 });

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('pickup_requests')
      .select(`
        *,
        student:students(id, first_name, last_name, student_id_number, photo_url, class:school_classes(name)),
        parent:user_profiles!parent_user_id(full_name, phone)
      `)
      .eq('school_id', schoolId)
      .eq('request_date', date)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ pickup_requests: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/pickup-requests
 * Parent sends a pickup request to the school.
 * body: { student_id, pickup_person_name, pickup_person_phone, message }
 */
export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { student_id, pickup_person_name, pickup_person_phone, message } = await request.json();

    if (!student_id || !pickup_person_name?.trim()) {
      return NextResponse.json({ error: 'student_id and pickup_person_name required' }, { status: 400 });
    }

    const supabase = getAdminClient();

    // Verify parent is linked to student
    const { data: link } = await supabase
      .from('student_parents')
      .select('student_id')
      .eq('student_id', student_id)
      .eq('parent_user_id', session.user_id)
      .maybeSingle();

    if (!link) {
      return NextResponse.json({ error: 'You are not linked to this student' }, { status: 403 });
    }

    const { data: student } = await supabase
      .from('students')
      .select('*, school:schools(name, primary_color)')
      .eq('id', student_id)
      .single();

    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    const today = (await import('@/lib/timezone')).todayInLagos();
    const school = Array.isArray(student.school) ? student.school[0] : student.school;

    const { data: req, error: reqErr } = await supabase
      .from('pickup_requests')
      .insert({
        school_id: student.school_id,
        student_id,
        parent_user_id: session.user_id,
        pickup_person_name: pickup_person_name.trim(),
        pickup_person_phone: pickup_person_phone?.trim() || null,
        message: message?.trim() || null,
        status: 'pending',
        request_date: today,
      })
      .select()
      .single();

    if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 });

    // Notify school admins and gate officers
    const { data: staffRoles } = await supabase
      .from('user_school_roles')
      .select('user_id')
      .eq('school_id', student.school_id)
      .in('role', ['school_admin', 'gate_officer'])
      .eq('is_active', true);

    const notifTitle = `Pickup request: ${student.first_name} ${student.last_name}`;
    const notifMsg = `${pickup_person_name} will pick up ${student.first_name}${pickup_person_phone ? ` · ${pickup_person_phone}` : ''}${message ? `. Note: ${message}` : ''}`;

    for (const staff of staffRoles || []) {
      await supabase.from('notifications').insert({
        user_id: staff.user_id,
        school_id: student.school_id,
        student_id,
        title: notifTitle,
        message: notifMsg,
        type: 'pickup_request',
        is_read: false,
      });
    }

    // Email school admins
    if (process.env.RESEND_API_KEY) {
      const adminIds = (staffRoles || []).map((r: any) => r.user_id);
      if (adminIds.length > 0) {
        const { data: admins } = await supabase
          .from('user_profiles')
          .select('email')
          .in('id', adminIds);

        for (const admin of admins || []) {
          try {
            await resend.emails.send({
              from: `MyEduRide <noreply@myeduride.com>`,
              to: admin.email,
              subject: notifTitle,
              html: `<p>${notifMsg}</p><p>School: ${school?.name}</p>`,
            });
          } catch (e) {
            console.error('[pickup-requests] email failed:', e);
          }
        }
      }
    }

    return NextResponse.json({ success: true, pickup_request: req });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/pickup-requests
 * Admin/gate acknowledges or completes a pickup request.
 * body: { id, status: 'acknowledged' | 'completed', school_id }
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id, status, school_id } = await request.json();
    if (!id || !status || !school_id) {
      return NextResponse.json({ error: 'id, status, school_id required' }, { status: 400 });
    }

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('pickup_requests')
      .update({
        status,
        acknowledged_by: session.user_id,
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('school_id', school_id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, pickup_request: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
