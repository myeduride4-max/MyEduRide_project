import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest } from '@/lib/session';
import { todayInLagos } from '@/lib/timezone';

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const {
      student_id,
      pickup_person_name,
      pickup_person_phone,
      relationship,
      notes,
      is_self,
    } = await request.json();

    if (!student_id || !pickup_person_name?.trim()) {
      return NextResponse.json({ error: 'student_id and pickup person name required' }, { status: 400 });
    }

    const supabase = getAdminClient();

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
      .select('school_id, first_name, last_name')
      .eq('id', student_id)
      .single();

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const noticeDate = todayInLagos();

    const { data: notice, error } = await supabase
      .from('pickup_notices')
      .insert({
        student_id,
        school_id: student.school_id,
        parent_user_id: session.user_id,
        pickup_person_name: pickup_person_name.trim(),
        pickup_person_phone: pickup_person_phone?.trim() || null,
        relationship: relationship?.trim() || (is_self ? 'parent (self)' : 'authorized pickup'),
        notes: notes?.trim() || null,
        is_self_pickup: !!is_self,
        notice_date: noticeDate,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: gateRoles } = await supabase
      .from('user_school_roles')
      .select('user_id')
      .eq('school_id', student.school_id)
      .eq('role', 'gate_officer')
      .eq('is_active', true);

    const title = `Pickup notice: ${student.first_name}`;
    const message = `${pickup_person_name} will pick up ${student.first_name} ${student.last_name}${notes ? `. Note: ${notes}` : ''}`;

    for (const gate of gateRoles || []) {
      await supabase.from('notifications').insert({
        user_id: gate.user_id,
        school_id: student.school_id,
        student_id,
        title,
        message,
        type: 'system',
        is_read: false,
      });
    }

    return NextResponse.json({ success: true, notice });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to send notice' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const studentId = request.nextUrl.searchParams.get('student_id');
    const supabase = getAdminClient();

    let q = supabase
      .from('pickup_notices')
      .select('*')
      .eq('parent_user_id', session.user_id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (studentId) q = q.eq('student_id', studentId);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ notices: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
