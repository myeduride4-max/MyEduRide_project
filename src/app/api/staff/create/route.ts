import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { ensureAuthUser, ensureUserProfile } from '@/lib/auth/ensure-user';
import { resolveInitialPassword, validatePasswordPair } from '@/lib/auth/password-policy';
import { setAuthPasswordForProfile } from '@/lib/auth/update-password';
import { isValidUsername, normalizeUsername } from '@/lib/auth/username';
import { uploadBase64Photo } from '@/lib/storage/upload-photo';
import { Resend } from 'resend';
import { getActiveSchoolRoles, userHasRoleAtSchool } from '@/lib/auth/username-school-scope';
import {
  STAFF_PROFILE_ACCESS_ROLES,
  getCustomRole,
} from '@/lib/staff/custom-roles';

const resend = new Resend(process.env.RESEND_API_KEY);

const SYSTEM_ACCESS_ROLES = new Set(['staff', 'teacher', 'gate_officer', 'school_admin']);

export async function POST(request: NextRequest) {
  try {
    const {
      username,
      full_name,
      phone,
      role,
      school_id,
      class_id,
      custom_role_id,
      custom_fields,
      photo_base64,
      face_descriptor,
      face_photos,
      skip_face,
      contact_email,
      initial_password,
      confirm_password,
    } = await request.json();

    const accessRole = role || 'staff';

    if (!username?.trim() || !full_name?.trim() || !accessRole || !school_id) {
      return NextResponse.json({ error: 'Username, name, role, and school are required' }, { status: 400 });
    }

    const normalizedUsername = normalizeUsername(username);
    if (!isValidUsername(normalizedUsername)) {
      return NextResponse.json(
        { error: 'Username must be 3–30 characters (letters, numbers, underscore only)' },
        { status: 400 }
      );
    }

    if (!SYSTEM_ACCESS_ROLES.has(accessRole)) {
      return NextResponse.json({ error: 'Invalid access role' }, { status: 400 });
    }

    const initialPassword = resolveInitialPassword(initial_password);
    if (initial_password !== undefined && initial_password !== null && initial_password !== '') {
      const pwErr = validatePasswordPair(initial_password, confirm_password || '');
      if (pwErr) {
        return NextResponse.json({ error: pwErr }, { status: 400 });
      }
    }

    const normalizedEmail = contact_email?.trim()
      ? contact_email.toLowerCase().trim()
      : null;
    const supabase = getAdminClient();

    let customRole = null;
    if (accessRole === 'staff') {
      if (!custom_role_id) {
        return NextResponse.json({ error: 'Select a job role (e.g. Accountant, Cleaner)' }, { status: 400 });
      }
      customRole = await getCustomRole(supabase, custom_role_id, school_id);
      if (!customRole) {
        return NextResponse.json({ error: 'Job role not found' }, { status: 400 });
      }
    }

    const mayAssignClass =
      accessRole === 'teacher' || (accessRole === 'staff' && !!customRole?.can_assign_class);

    if (class_id && !mayAssignClass) {
      return NextResponse.json(
        { error: 'This role cannot be assigned to a class — only class teachers need a class' },
        { status: 400 }
      );
    }

    const needsFace = accessRole === 'gate_officer' && !skip_face;
    const hasFace =
      !!photo_base64 || (Array.isArray(face_photos) && face_photos.length >= 3) || skip_face;

    if (needsFace && !hasFace) {
      return NextResponse.json({ error: 'Gate officers need 3 face photos for recognition' }, { status: 400 });
    }

    const { data: existingUser } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('username', normalizedUsername)
      .maybeSingle();

    let userId: string;
    let generatedPassword: string | undefined;

    if (existingUser) {
      const existingRoles = await getActiveSchoolRoles(supabase, existingUser.id);
      const belongsHere = userHasRoleAtSchool(existingRoles, school_id);

      if (!belongsHere && existingRoles.length > 0) {
        return NextResponse.json(
          { error: 'This username is already in use. Choose a different username.' },
          { status: 409 }
        );
      }

      userId = existingUser.id;
      if (initialPassword) {
        const { error: pwErr } = await setAuthPasswordForProfile(supabase, userId, initialPassword, {
          createAuthIfMissing: true,
        });
        if (pwErr) {
          return NextResponse.json({ error: pwErr }, { status: 500 });
        }
        generatedPassword = initialPassword;
      }
    } else {
      const { userId: authId, password, error: authErr } = await ensureAuthUser(supabase, {
        username: normalizedUsername,
        full_name: full_name.trim(),
        password: initialPassword || undefined,
      });
      if (!authId) {
        return NextResponse.json(
          { error: `Failed to create user account${authErr ? `: ${authErr}` : ''}` },
          { status: 500 }
        );
      }
      userId = authId;
      generatedPassword = password;
    }

    const { error: profileError } = await ensureUserProfile(supabase, {
      id: userId,
      username: normalizedUsername,
      full_name: full_name.trim(),
      phone: phone || null,
      email: normalizedEmail,
    });

    if (profileError) {
      return NextResponse.json({ error: `Failed to save user profile: ${profileError.message}` }, { status: 500 });
    }

    const { data: existingRole } = await supabase
      .from('user_school_roles')
      .select('id')
      .eq('user_id', userId)
      .eq('school_id', school_id)
      .eq('role', accessRole)
      .maybeSingle();

    if (existingRole) {
      return NextResponse.json({ error: 'This person already has this access at this school' }, { status: 400 });
    }

    const { error: roleError } = await supabase.from('user_school_roles').insert({
      user_id: userId,
      school_id: school_id,
      role: accessRole,
      is_active: true,
    });

    if (roleError) {
      return NextResponse.json({ error: `Failed to assign role: ${roleError.message}` }, { status: 500 });
    }

    const roleLabel =
      accessRole === 'staff'
        ? customRole!.name
        : accessRole.replace(/_/g, ' ');

    let savedStaffProfile: { staff_id_number?: string; photo_url?: string | null } | null = null;

    if (STAFF_PROFILE_ACCESS_ROLES.has(accessRole)) {
      const { data: existingProfile } = await supabase
        .from('teacher_profiles')
        .select('id, staff_id_number, qr_code_data, photo_url, face_descriptor, custom_fields')
        .eq('user_id', userId)
        .eq('school_id', school_id)
        .maybeSingle();

      const staffIdNumber =
        existingProfile?.staff_id_number ||
        `STF-${school_id.slice(0, 4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
      const qrCodeData =
        existingProfile?.qr_code_data || `MYEDURIDE:STAFF:${staffIdNumber}`;

      const photoSource = photo_base64 || (Array.isArray(face_photos) && face_photos[0]) || null;
      let photoUrl: string | null = existingProfile?.photo_url ?? null;
      if (photoSource) {
        const storagePath = `staff/${school_id}/${staffIdNumber}.jpg`;
        const { path, error: uploadErr } = await uploadBase64Photo(supabase, storagePath, photoSource);
        if (uploadErr || !path) {
          return NextResponse.json(
            { error: `Photo could not be saved: ${uploadErr || 'upload failed'}` },
            { status: 500 }
          );
        }
        photoUrl = path;
      }

      const profilePayload: Record<string, unknown> = {
        user_id: userId,
        school_id: school_id,
        staff_id_number: staffIdNumber,
        qr_code_data: qrCodeData,
        photo_url: photoUrl,
        face_descriptor:
          face_descriptor != null
            ? face_descriptor
            : existingProfile?.face_descriptor ?? null,
        custom_fields:
          custom_fields && Object.keys(custom_fields).length
            ? custom_fields
            : existingProfile?.custom_fields ?? {},
        custom_role_id: accessRole === 'staff' ? custom_role_id : null,
      };

      let staffProfile;
      let staffProfileErr;

      if (existingProfile?.id) {
        const updatePayload: Record<string, unknown> = {};
        if (photoSource) updatePayload.photo_url = photoUrl;
        if (face_descriptor != null) updatePayload.face_descriptor = face_descriptor;
        if (accessRole === 'staff' && custom_role_id) {
          updatePayload.custom_role_id = custom_role_id;
        }
        if (custom_fields && Object.keys(custom_fields).length) {
          updatePayload.custom_fields = custom_fields;
        }
        const upd = await supabase
          .from('teacher_profiles')
          .update(updatePayload)
          .eq('id', existingProfile.id)
          .select()
          .single();
        staffProfile = upd.data ?? existingProfile;
        staffProfileErr = Object.keys(updatePayload).length ? upd.error : null;
      } else {
        const ins = await supabase.from('teacher_profiles').insert(profilePayload).select().single();
        staffProfile = ins.data;
        staffProfileErr = ins.error;
      }

      if (staffProfileErr && /custom_role_id/i.test(staffProfileErr.message)) {
        const legacy = { ...profilePayload };
        delete legacy.custom_role_id;
        if (existingProfile?.id) {
          const legacyUpd = { ...legacy };
          delete legacyUpd.user_id;
          delete legacyUpd.school_id;
          const retry = await supabase
            .from('teacher_profiles')
            .update(legacyUpd)
            .eq('id', existingProfile.id)
            .select()
            .single();
          staffProfile = retry.data;
          staffProfileErr = retry.error;
        } else {
          const retry = await supabase.from('teacher_profiles').insert(legacy).select().single();
          staffProfile = retry.data;
          staffProfileErr = retry.error;
        }
      }

      if (staffProfileErr) {
        return NextResponse.json({ error: `Failed to save staff profile: ${staffProfileErr.message}` }, { status: 500 });
      }

      savedStaffProfile = staffProfile;

      if (mayAssignClass && class_id && staffProfile) {
        await supabase.from('teacher_class_assignments').upsert(
          {
            teacher_profile_id: staffProfile.id,
            class_id: class_id,
            is_primary: true,
          },
          { onConflict: 'teacher_profile_id,class_id' }
        );

        if (accessRole === 'teacher' || customRole?.can_assign_class) {
          await supabase
            .from('school_classes')
            .update({ assigned_teacher_id: staffProfile.id })
            .eq('id', class_id)
            .eq('school_id', school_id);
        }
      }
    }

    const { data: school } = await supabase.from('schools').select('name').eq('id', school_id).single();

    if (normalizedEmail) {
      try {
        await resend.emails.send({
          from: `MyEduRide <noreply@assetid.site>`,
          to: normalizedEmail,
          subject: `You have been added as ${roleLabel} at ${school?.name || 'a school'}`,
          html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto;">
            <div style="background: #1B4D3E; padding: 20px; text-align: center; border-radius: 12px 12px 0 0;">
              <h2 style="color: white; margin: 0; font-size: 18px;">Welcome to MyEduRide</h2>
            </div>
            <div style="padding: 24px; background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
              <p>Hello ${full_name},</p>
              <p>You have been added as <strong>${roleLabel}</strong> at <strong>${school?.name || 'your school'}</strong>.</p>
              <p>Use your staff ID card to sign in and out at the gate. View your attendance from your staff dashboard after login.</p>
              <p><strong>Username:</strong> ${normalizedUsername}</p>
              ${generatedPassword ? `<p><strong>Password:</strong> ${generatedPassword}</p>` : ''}
              <p><strong>To login:</strong> Visit <a href="${process.env.NEXT_PUBLIC_APP_URL}">${process.env.NEXT_PUBLIC_APP_URL}</a> and sign in with your username and password.</p>
              <br>
              <p style="color: #666; font-size: 12px;">MyEduRide — The Student Safety Platform</p>
            </div>
          </div>
        `,
        });
      } catch (emailErr) {
        console.error('Email send failed:', emailErr);
      }
    }

    return NextResponse.json({
      success: true,
      userId,
      username: normalizedUsername,
      password: generatedPassword,
      role: accessRole,
      job_title: roleLabel,
      staff_profile: savedStaffProfile
        ? {
            staff_id_number: savedStaffProfile.staff_id_number,
            photo_url: savedStaffProfile.photo_url,
          }
        : null,
    });
  } catch (error) {
    console.error('Staff creation error:', error);
    return NextResponse.json({ error: 'Failed to create staff member' }, { status: 500 });
  }
}
