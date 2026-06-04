import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest, sessionHasRole } from '@/lib/session';
import { assertTeacherStudentAccess } from '@/lib/attendance/teacher-access';
import { todayInLagos } from '@/lib/timezone';

export const dynamic = 'force-dynamic';

/**
 * POST /api/teacher/extra-lesson
 * body: { student_id, school_id, lesson_end_time?, action: 'add' | 'release' }
 *
 * add     → mark student as staying for extra lesson (not ready for pickup)
 * release → end extra lesson and mark student ready for pickup
 */
export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { student_id, school_id, lesson_end_time, action } = await request.json();
    if (!student_id || !school_id || !action) {
      return NextResponse.json({ error: 'student_id, school_id, action required' }, { status: 400 });
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

    if (action === 'add') {
      const { data, error } = await supabase
        .from('extra_lessons')
        .upsert(
          {
            student_id,
            school_id,
            teacher_user_id: session.user_id,
            lesson_end_time: lesson_end_time || null,
            date: today,
            is_released: false,
          },
          { onConflict: 'student_id,date' }
        )
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, extra_lesson: data });
    }

    if (action === 'release') {
      const { error } = await supabase
        .from('extra_lessons')
        .update({ is_released: true, released_at: new Date().toISOString() })
        .eq('student_id', student_id)
        .eq('school_id', school_id)
        .eq('date', today);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const readyRes = await fetch(new URL('/api/teacher/ready-for-pickup', request.url).toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: request.headers.get('cookie') || '',
        },
        body: JSON.stringify({ student_id, school_id }),
      });

      const readyJson = await readyRes.json();
      if (!readyRes.ok && readyRes.status !== 409) {
        return NextResponse.json(
          { error: readyJson.error || 'Extra lesson ended but ready-for-pickup failed' },
          { status: readyRes.status }
        );
      }

      return NextResponse.json({
        success: true,
        ready: readyRes.ok,
        dismissal: readyJson.dismissal || null,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: unknown) {
    console.error('[extra-lesson]', err);
    const message = err instanceof Error ? err.message : 'Failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
