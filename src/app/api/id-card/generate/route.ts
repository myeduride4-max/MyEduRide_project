import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * Generates ID card data for a student or teacher/staff.
 * Returns the card info (school name, person name, ID, QR data, etc.)
 * The actual PDF rendering happens client-side with jsPDF.
 */
export async function POST(request: NextRequest) {
  try {
    const { student_id, teacher_id, staff_id, type } = await request.json();
    const supabase = getAdminClient();

    if (type === 'student' || (!type && student_id)) {
      const { data: student } = await supabase
        .from('students')
        .select('*, school:schools(name, address, logo_url, primary_color), class:school_classes(name)')
        .eq('id', student_id)
        .single();

      if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

      const school = Array.isArray(student.school) ? student.school[0] : student.school;
      const cls = Array.isArray(student.class) ? student.class[0] : student.class;

      return NextResponse.json({
        card: {
          type: 'student',
          school_name: school?.name || '',
          school_address: school?.address || '',
          school_logo: school?.logo_url || '',
          school_color: school?.primary_color || '#1B4D3E',
          name: `${student.first_name} ${student.last_name}`,
          id_number: student.student_id_number,
          class_name: cls?.name || '',
          qr_code_data: student.qr_code_data,
          photo_url: student.photo_url,
          address: student.custom_fields?.address || '',
          dob: student.custom_fields?.date_of_birth || '',
        },
      });
    }

    // Teacher / staff ID card
    const profileId = teacher_id || staff_id;
    if (type === 'teacher' || type === 'staff' || profileId) {
      const { data: profile } = await supabase
        .from('teacher_profiles')
        .select(`
          *,
          user:user_profiles(full_name, email, phone),
          school:schools(name, address, logo_url, primary_color),
          custom_role:school_custom_roles(name)
        `)
        .eq('id', profileId)
        .single();

      if (!profile) return NextResponse.json({ error: 'Staff profile not found' }, { status: 404 });

      const user = Array.isArray(profile.user) ? profile.user[0] : profile.user;
      const school = Array.isArray(profile.school) ? profile.school[0] : profile.school;
      const customRole = Array.isArray(profile.custom_role) ? profile.custom_role[0] : profile.custom_role;

      // Resolve role label
      let roleLabel = 'Staff';
      if (customRole?.name) {
        roleLabel = customRole.name;
      } else {
        // Look up user_school_roles for role
        const { data: roleRow } = await supabase
          .from('user_school_roles')
          .select('role')
          .eq('user_id', profile.user_id)
          .eq('school_id', profile.school_id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        if (roleRow?.role) {
          roleLabel = roleRow.role === 'teacher' ? 'Teacher'
            : roleRow.role === 'gate_officer' ? 'Gate Officer'
            : roleRow.role === 'school_admin' ? 'School Admin'
            : 'Staff';
        }
      }

      return NextResponse.json({
        card: {
          type: 'staff',
          school_name: school?.name || '',
          school_address: school?.address || '',
          school_logo: school?.logo_url || '',
          school_color: school?.primary_color || '#1B4D3E',
          name: user?.full_name || 'Staff',
          id_number: profile.staff_id_number || '',
          role_label: roleLabel,
          qr_code_data: profile.qr_code_data || '',
          photo_url: profile.photo_url,
          email: user?.email || '',
          phone: user?.phone || '',
        },
      });
    }

    return NextResponse.json({ error: 'Invalid type or missing id' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
