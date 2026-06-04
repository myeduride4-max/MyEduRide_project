import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest } from '@/lib/session';
import { todayInLagos } from '@/lib/timezone';
import { writeAuditLog } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

/** POST — promote one or more students to a target class (school admin only). */
export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { school_id, student_ids, to_class_id, effective_date, effective_term } = await request.json();

    if (!school_id || !to_class_id || !student_ids?.length) {
      return NextResponse.json(
        { error: 'school_id, to_class_id, and student_ids are required' },
        { status: 400 }
      );
    }

    const isAdmin = session.roles.some(
      (r: { role: string; school_id: string }) =>
        r.role === 'super_admin' || (r.role === 'school_admin' && r.school_id === school_id)
    );
    if (!isAdmin) {
      return NextResponse.json({ error: 'Only school admin can promote students' }, { status: 403 });
    }

    const supabase = getAdminClient();

    const { data: targetClass } = await supabase
      .from('school_classes')
      .select('id, school_id, name')
      .eq('id', to_class_id)
      .eq('school_id', school_id)
      .maybeSingle();

    if (!targetClass) {
      return NextResponse.json({ error: 'Target class not found for this school' }, { status: 404 });
    }

    const date = effective_date || todayInLagos();
    const promoted: string[] = [];

    for (const studentId of student_ids as string[]) {
      const { data: student } = await supabase
        .from('students')
        .select('id, class_id, first_name, last_name')
        .eq('id', studentId)
        .eq('school_id', school_id)
        .maybeSingle();

      if (!student) continue;

      const fromClassId = student.class_id;

      const { error: updateErr } = await supabase
        .from('students')
        .update({ class_id: to_class_id })
        .eq('id', studentId);

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      await supabase.from('student_class_promotions').insert({
        school_id,
        student_id: studentId,
        from_class_id: fromClassId,
        to_class_id,
        effective_date: date,
        effective_term: effective_term?.trim() || null,
        promoted_by: session.user_id,
      });

      promoted.push(studentId);
    }

    if (promoted.length === 0) {
      return NextResponse.json({ error: 'No students were promoted' }, { status: 400 });
    }

    await writeAuditLog(supabase, {
      school_id,
      actor_user_id: session.user_id,
      action: 'students_promoted',
      entity_type: 'school_classes',
      entity_id: to_class_id,
      details: {
        count: promoted.length,
        to_class: targetClass.name,
        student_ids: promoted,
        effective_date: date,
        effective_term: effective_term?.trim() || null,
      },
    });

    return NextResponse.json({
      success: true,
      promoted_count: promoted.length,
      to_class: targetClass.name,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Promotion failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
