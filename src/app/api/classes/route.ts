import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest } from '@/lib/session';
import { isEligibleClassTeacherProfile } from '@/lib/school/eligible-class-teachers';

export const dynamic = 'force-dynamic';

/** GET /api/classes?school_id=xxx  — list all classes for a school */
export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const schoolId = request.nextUrl.searchParams.get('school_id');
    if (!schoolId) return NextResponse.json({ error: 'school_id required' }, { status: 400 });

    const supabase = getAdminClient();
    // Simple select — no embed on assigned_teacher_id (no FK in DB; embed breaks the whole query)
    const isAdmin = session.roles.some(
      (r: { role: string; school_id: string }) =>
        r.role === 'super_admin' || (r.role === 'school_admin' && r.school_id === schoolId)
    );
    if (!isAdmin) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('school_classes')
      .select('*')
      .eq('school_id', schoolId)
      .order('name', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const teacherIds = [
      ...new Set((data || []).map((c: { assigned_teacher_id?: string | null }) => c.assigned_teacher_id).filter(Boolean)),
    ] as string[];
    const teacherById: Record<string, { id: string; user: { full_name: string } | null }> = {};
    if (teacherIds.length > 0) {
      const { data: teachers } = await supabase
        .from('teacher_profiles')
        .select('id, user:user_profiles(full_name)')
        .in('id', teacherIds);
      for (const t of teachers || []) {
        const row = t as { id: string; user?: { full_name: string } | { full_name: string }[] | null };
        const user = Array.isArray(row.user) ? row.user[0] : row.user;
        teacherById[row.id] = { id: row.id, user: user || null };
      }
    }

    // Count students per class
    const classIds = (data || []).map((c: { id: string }) => c.id);
    let studentCounts: Record<string, number> = {};
    if (classIds.length > 0) {
      const { data: counts } = await supabase
        .from('students')
        .select('class_id')
        .in('class_id', classIds)
        .eq('is_active', true);
      for (const s of counts || []) {
        studentCounts[s.class_id] = (studentCounts[s.class_id] || 0) + 1;
      }
    }

    const enriched = (data || [])
      .filter((c: { is_active?: boolean | null }) => c.is_active !== false)
      .map((c: { id: string; assigned_teacher_id?: string | null }) => ({
        ...c,
        assigned_teacher: c.assigned_teacher_id ? teacherById[c.assigned_teacher_id] || null : null,
        student_count: studentCounts[c.id] || 0,
      }));

    return NextResponse.json({ classes: enriched });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** POST /api/classes  — create a class */
export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await request.json();
    const { school_id, name, grade, section, assigned_teacher_id, sort_order } = body;

    const arm = section?.trim();
    if (!school_id || !name?.trim()) {
      return NextResponse.json({ error: 'school_id and class name are required' }, { status: 400 });
    }
    if (!arm) {
      return NextResponse.json({ error: 'Arm is required (e.g. A, B, or C)' }, { status: 400 });
    }

    const gradeValue = grade?.trim() || name.trim();

    // Verify admin access
    const isAdmin = session.roles.some(
      (r: any) => r.school_id === school_id && ['school_admin', 'super_admin'].includes(r.role)
    );
    if (!isAdmin) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const supabase = getAdminClient();

    if (assigned_teacher_id) {
      const ok = await isEligibleClassTeacherProfile(supabase, school_id, assigned_teacher_id);
      if (!ok) {
        return NextResponse.json(
          {
            error:
              'Only class teachers can be assigned to a class. Gate officers, staff, and admins cannot be homeroom teachers.',
          },
          { status: 400 }
        );
      }
    }

    const { data: duplicate } = await supabase
      .from('school_classes')
      .select('id')
      .eq('school_id', school_id)
      .eq('name', name.trim())
      .eq('section', arm)
      .eq('is_active', true)
      .maybeSingle();

    if (duplicate) {
      return NextResponse.json(
        { error: `Class "${name.trim()}" with arm ${arm} already exists` },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from('school_classes')
      .insert({
        school_id,
        name: name.trim(),
        grade: gradeValue,
        section: arm,
        assigned_teacher_id: assigned_teacher_id || null,
        sort_order: sort_order ?? 0,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          {
            error: `Class "${name.trim()}" with arm ${arm} already exists. For a new database, run supabase/schema.sql in the Supabase SQL Editor.`,
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (assigned_teacher_id && data?.id) {
      await supabase.from('teacher_class_assignments').upsert(
        { teacher_profile_id: assigned_teacher_id, class_id: data.id, is_primary: true },
        { onConflict: 'teacher_profile_id,class_id' }
      );
    }

    return NextResponse.json({ success: true, class: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** PUT /api/classes  — update a class */
export async function PUT(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await request.json();
    const { id, school_id, name, grade, section, assigned_teacher_id, sort_order } = body;

    if (!id || !school_id) {
      return NextResponse.json({ error: 'id and school_id required' }, { status: 400 });
    }

    const isAdmin = session.roles.some(
      (r: any) => r.school_id === school_id && ['school_admin', 'super_admin'].includes(r.role)
    );
    if (!isAdmin) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const supabase = getAdminClient();

    if (assigned_teacher_id) {
      const ok = await isEligibleClassTeacherProfile(supabase, school_id, assigned_teacher_id);
      if (!ok) {
        return NextResponse.json(
          {
            error:
              'Only class teachers can be assigned to a class. Gate officers, staff, and admins cannot be homeroom teachers.',
          },
          { status: 400 }
        );
      }
    }

    const nextName = name !== undefined ? name.trim() : undefined;
    const nextArm = section !== undefined ? section?.trim() : undefined;
    if (section !== undefined && !nextArm) {
      return NextResponse.json({ error: 'Arm is required (e.g. A, B, or C)' }, { status: 400 });
    }

    if (nextName && nextArm) {
      const { data: duplicate } = await supabase
        .from('school_classes')
        .select('id')
        .eq('school_id', school_id)
        .eq('name', nextName)
        .eq('section', nextArm)
        .eq('is_active', true)
        .neq('id', id)
        .maybeSingle();
      if (duplicate) {
        return NextResponse.json(
          { error: `Class "${nextName}" with arm ${nextArm} already exists` },
          { status: 409 }
        );
      }
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = nextName;
    if (grade !== undefined) updates.grade = grade.trim();
    else if (name !== undefined) updates.grade = nextName;
    if (section !== undefined) updates.section = nextArm;
    if (assigned_teacher_id !== undefined) updates.assigned_teacher_id = assigned_teacher_id || null;
    if (sort_order !== undefined) updates.sort_order = sort_order;

    const { data, error } = await supabase
      .from('school_classes')
      .update(updates)
      .eq('id', id)
      .eq('school_id', school_id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A class with this name and arm already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (assigned_teacher_id !== undefined && id) {
      await supabase.from('teacher_class_assignments').delete().eq('class_id', id);
      if (assigned_teacher_id) {
        await supabase.from('teacher_class_assignments').upsert(
          { teacher_profile_id: assigned_teacher_id, class_id: id, is_primary: true },
          { onConflict: 'teacher_profile_id,class_id' }
        );
      }
    }

    return NextResponse.json({ success: true, class: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** DELETE /api/classes?id=xxx&school_id=xxx  — soft-delete a class */
export async function DELETE(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const id = request.nextUrl.searchParams.get('id');
    const schoolId = request.nextUrl.searchParams.get('school_id');

    if (!id || !schoolId) {
      return NextResponse.json({ error: 'id and school_id required' }, { status: 400 });
    }

    const isAdmin = session.roles.some(
      (r: any) => r.school_id === schoolId && ['school_admin', 'super_admin'].includes(r.role)
    );
    if (!isAdmin) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const supabase = getAdminClient();

    // Check if any active students are in this class
    const { count } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('class_id', id)
      .eq('is_active', true);

    if ((count || 0) > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${count} active student(s) are assigned to this class. Reassign them first.` },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from('school_classes')
      .update({ is_active: false })
      .eq('id', id)
      .eq('school_id', schoolId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
