import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest, sessionHasRole } from '@/lib/session';
import { buildIdCardsPdfBuffer } from '@/lib/id-card/generate-pdf';
import type { IdCardPerson, SchoolBranding } from '@/lib/id-card/generate-pdf';
import { loadPhotoDataUrl } from '@/lib/id-card/load-photo';
import { ensureStaffProfile } from '@/lib/staff/ensure-profile';
import { resolveStaffRoleLabel } from '@/lib/attendance/resolve-staff';

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request); 
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { school_id, student_ids, staff_role_ids } = await request.json();

    if (!school_id) {
      return NextResponse.json({ error: 'school_id required' }, { status: 400 });
    }

    if (!sessionHasRole(session, 'super_admin')) {
      return NextResponse.json(
        { error: 'Only super admin can generate ID cards' },
        { status: 403 }
      );
    }

    const supabase = getAdminClient();

    const { data: school, error: schoolErr } = await supabase
      .from('schools')
      .select('name, address, logo_url, principal_signature_url, primary_color')
      .eq('id', school_id)
      .single();

    if (schoolErr || !school) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    const logoDataUrl = await loadPhotoDataUrl(supabase, school.logo_url);
    const signatureDataUrl = await loadPhotoDataUrl(supabase, school.principal_signature_url);

    const branding: SchoolBranding = {
      name: school.name,
      address: school.address,
      logoUrl: logoDataUrl || school.logo_url,
      signatureUrl: signatureDataUrl || school.principal_signature_url,
      primaryColor: school.primary_color,
    };

    const persons: IdCardPerson[] = [];

    if (student_ids?.length) {
      const { data: students } = await supabase
        .from('students')
        .select('*, class:school_classes(name)')
        .eq('school_id', school_id)
        .in('id', student_ids)
        .eq('is_active', true);

      for (const s of students || []) {
        const qrData = s.qr_code_data || `MYEDURIDE:${s.student_id_number}`;
        const photoDataUrl = await loadPhotoDataUrl(supabase, s.photo_url);
        persons.push({
          kind: 'student',
          fullName: `${s.first_name} ${s.last_name}`,
          idNumber: s.student_id_number,
          qrData,
          photoDataUrl,
          birth: s.custom_fields?.date_of_birth || '—',
          address: s.custom_fields?.address || school.address || '—',
          className: s.class?.name,
        });
      }
    }

    if (staff_role_ids?.length) {
      const { data: roles } = await supabase
        .from('user_school_roles')
        .select('id, role, user_id, profile:user_profiles(full_name, phone)')
        .in('id', staff_role_ids)
        .eq('school_id', school_id);

      for (const r of roles || []) {
        const profile = await ensureStaffProfile(supabase, school_id, r.user_id);
        if (!profile?.staff_id_number) continue;

        const photoDataUrl = await loadPhotoDataUrl(supabase, profile.photo_url);
        const name = (r.profile as { full_name?: string })?.full_name || 'Staff';
        const roleLabel = await resolveStaffRoleLabel(supabase, school_id, r.user_id);
        persons.push({
          kind: 'staff',
          fullName: name,
          idNumber: profile.staff_id_number,
          qrData: profile.qr_code_data || `MYEDURIDE:STAFF:${profile.staff_id_number}`,
          photoDataUrl,
          birth: '—',
          address: school.address || '—',
          roleLabel,
        });
      }
    }

    if (persons.length === 0) {
      return NextResponse.json({ error: 'No valid cards to generate' }, { status: 400 });
    }

    const pdfBytes = await buildIdCardsPdfBuffer(persons, branding);

    return new NextResponse(pdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="id_cards_${Date.now()}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error('[id-cards/download]', err);
    return NextResponse.json({ error: err.message || 'PDF generation failed' }, { status: 500 });
  }
}
