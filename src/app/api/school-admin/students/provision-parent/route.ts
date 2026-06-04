import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { validatePasswordPair } from '@/lib/auth/password-policy';
import {
  findExistingParentAccount,
  resolveParentDisplayName,
} from '@/lib/auth/find-existing-parent-account';
import {
  parentInfoFromCustomFields,
  provisionParentForStudent,
} from '@/lib/school/provision-parent-for-student';
import { getSessionFromRequest } from '@/lib/session';

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session?.user_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const schoolIds = Array.from(
    new Set(
      (session.roles || [])
        .filter((r) => r.role === 'school_admin')
        .map((r) => r.school_id)
        .filter(Boolean)
    )
  );

  if (schoolIds.length === 0) {
    return NextResponse.json({ error: 'School admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const studentId = (body.student_id || '').trim();
    const password = (body.password || '').trim();
    const confirmPassword = (body.confirm_password || password).trim();

    if (!studentId) {
      return NextResponse.json({ error: 'student_id is required' }, { status: 400 });
    }

    const supabase = getAdminClient();
    const { data: student, error: studErr } = await supabase
      .from('students')
      .select('id, school_id, custom_fields')
      .eq('id', studentId)
      .maybeSingle();

    if (studErr || !student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    if (!schoolIds.includes(student.school_id)) {
      return NextResponse.json({ error: 'Student is not in your school' }, { status: 403 });
    }

    const onFile = parentInfoFromCustomFields(
      student.custom_fields as Record<string, string> | null
    );
    const parentUsername = (body.parent_username || onFile.parent_username || '').trim() || null;
    if (!onFile.parent_name && !parentUsername && !onFile.parent_email) {
      return NextResponse.json(
        { error: 'Add parent username, name, or email on the student record first' },
        { status: 400 }
      );
    }

    const existingParentAccount = await findExistingParentAccount(
      supabase,
      parentUsername,
      onFile.parent_email,
      onFile.parent_phone
    );

    if (!existingParentAccount) {
      const pwErr = validatePasswordPair(password, confirmPassword);
      if (pwErr) {
        return NextResponse.json({ error: pwErr }, { status: 400 });
      }
    }

    const resolvedParentName = resolveParentDisplayName({
      parent_name: onFile.parent_name,
      parent_username: parentUsername,
      parent_email: onFile.parent_email,
      existing_full_name: existingParentAccount?.full_name,
    });

    const result = await provisionParentForStudent(supabase, {
      student_id: studentId,
      school_id: student.school_id,
      parent_name: resolvedParentName,
      parent_username: parentUsername,
      parent_email: onFile.parent_email,
      parent_phone: onFile.parent_phone,
      relationship: onFile.relationship,
      password: existingParentAccount ? undefined : password,
    });

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      parent_user_id: result.parent_user_id,
      parent_username: result.parent_username,
      password: result.password || undefined,
      created: result.created,
      linked: result.linked,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not create parent login';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
