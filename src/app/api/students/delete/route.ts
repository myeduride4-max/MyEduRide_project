import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { deleteStoragePhoto } from '@/lib/storage/upload-photo';

export async function POST(request: NextRequest) {
  try {
    const { student_id } = await request.json();
    if (!student_id) {
      return NextResponse.json({ error: 'student_id required' }, { status: 400 });
    }

    const supabase = getAdminClient();

    const { data: student, error: fetchErr } = await supabase
      .from('students')
      .select('id, school_id, photo_url')
      .eq('id', student_id)
      .single();

    if (fetchErr || !student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const { data: parentLinks } = await supabase
      .from('student_parents')
      .select('parent_user_id')
      .eq('student_id', student_id);

    const parentIds = [...new Set((parentLinks || []).map((l) => l.parent_user_id))];

    await supabase.from('student_parents').delete().eq('student_id', student_id);
    await supabase.from('attendance_records').delete().eq('student_id', student_id);
    await supabase.from('dismissal_requests').delete().eq('student_id', student_id);
    await supabase.from('notifications').delete().eq('student_id', student_id);

    const { error } = await supabase.from('students').delete().eq('id', student_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await deleteStoragePhoto(supabase, student.photo_url);

    const removedParents: string[] = [];

    for (const parentId of parentIds) {
      const { data: remainingLinks } = await supabase
        .from('student_parents')
        .select('student_id')
        .eq('parent_user_id', parentId);

      let hasOtherKidsAtSchool = false;
      if (remainingLinks?.length) {
        const otherIds = remainingLinks.map((l) => l.student_id);
        const { data: otherStudents } = await supabase
          .from('students')
          .select('school_id')
          .in('id', otherIds);
        hasOtherKidsAtSchool = (otherStudents || []).some((s) => s.school_id === student.school_id);
      }

      if (!hasOtherKidsAtSchool) {
        await supabase
          .from('user_school_roles')
          .delete()
          .eq('user_id', parentId)
          .eq('school_id', student.school_id)
          .eq('role', 'parent');

        await supabase
          .from('notifications')
          .delete()
          .eq('user_id', parentId)
          .eq('school_id', student.school_id);

        removedParents.push(parentId);
      }
    }

    return NextResponse.json({
      success: true,
      parents_removed: removedParents.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
