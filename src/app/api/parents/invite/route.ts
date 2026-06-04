import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { ensureAuthUser, ensureUserProfile } from '@/lib/auth/ensure-user';
import { suggestUniqueUsername } from '@/lib/auth/username';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const { student_id, school_id, parent_email, parent_name, parent_phone, relationship } = await request.json();

    if (!student_id || !school_id || !parent_name?.trim()) {
      return NextResponse.json({ error: 'Student, school, and parent name are required' }, { status: 400 });
    }

    const normalizedEmail = parent_email?.trim() ? parent_email.toLowerCase().trim() : null;
    const supabase = getAdminClient();

    const parentUsername = await suggestUniqueUsername(supabase, parent_name);

    const { data: existingUser } = await supabase
      .from('user_profiles')
      .select('id, username')
      .eq('username', parentUsername)
      .maybeSingle();

    let parentUserId: string;
    let generatedPassword: string | undefined;

    if (existingUser) {
      parentUserId = existingUser.id;
    } else {
      const { userId, password, error: authErr } = await ensureAuthUser(supabase, parentUsername);
      if (!userId) {
        return NextResponse.json(
          { error: `Failed to create parent account${authErr ? `: ${authErr}` : ''}` },
          { status: 500 }
        );
      }
      parentUserId = userId;
      generatedPassword = password;
    }

    const { error: profileError } = await ensureUserProfile(supabase, {
      id: parentUserId,
      username: parentUsername,
      full_name: parent_name.trim(),
      phone: parent_phone || null,
      email: normalizedEmail,
    });

    if (profileError) {
      return NextResponse.json({ error: `Failed to save parent profile: ${profileError.message}` }, { status: 500 });
    }

    const { data: existingRole } = await supabase
      .from('user_school_roles')
      .select('id')
      .eq('user_id', parentUserId)
      .eq('school_id', school_id)
      .eq('role', 'parent')
      .maybeSingle();

    if (!existingRole) {
      await supabase.from('user_school_roles').insert({
        user_id: parentUserId,
        school_id: school_id,
        role: 'parent',
        is_active: true,
      });
    }

    const { data: existingLink } = await supabase
      .from('student_parents')
      .select('id')
      .eq('student_id', student_id)
      .eq('parent_user_id', parentUserId)
      .maybeSingle();

    if (!existingLink) {
      await supabase.from('student_parents').insert({
        student_id: student_id,
        parent_user_id: parentUserId,
        relationship: relationship || 'parent',
        is_primary: true,
      });
    }

    const { data: school } = await supabase
      .from('schools')
      .select('name')
      .eq('id', school_id)
      .single();

    const { data: student } = await supabase
      .from('students')
      .select('first_name, last_name')
      .eq('id', student_id)
      .single();

    if (school && student && normalizedEmail) {
      try {
        await resend.emails.send({
          from: 'MyEduRide <noreply@assetid.site>',
          to: normalizedEmail,
          subject: `Your child ${student.first_name} has been registered at ${school.name}`,
          html: `
            <h2>Welcome to MyEduRide!</h2>
            <p>Hello ${parent_name},</p>
            <p><strong>${student.first_name} ${student.last_name}</strong> has been registered at <strong>${school.name}</strong>.</p>
            <p>You can now access your parent dashboard to:</p>
            <ul>
              <li>See when your child arrives and leaves school</li>
              <li>View attendance history</li>
              <li>Receive real-time notifications</li>
            </ul>
            <p><strong>Username:</strong> ${parentUsername}</p>
            ${generatedPassword ? `<p><strong>Password:</strong> ${generatedPassword}</p>` : ''}
            <p><strong>To login:</strong> Visit <a href="${process.env.NEXT_PUBLIC_APP_URL}">${process.env.NEXT_PUBLIC_APP_URL}</a> and sign in with your username and password.</p>
            <br>
            <p style="color: #666;">— MyEduRide Team</p>
          `,
        });
      } catch (emailErr) {
        console.error('Parent invite email failed:', emailErr);
      }
    }

    return NextResponse.json({
      success: true,
      parentUserId,
      username: parentUsername,
      password: generatedPassword,
    });
  } catch (error) {
    console.error('Parent invite error:', error);
    return NextResponse.json({ error: 'Failed to invite parent' }, { status: 500 });
  }
}
