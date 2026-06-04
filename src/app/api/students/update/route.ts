import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { uploadBase64Photo, deleteStoragePhoto } from '@/lib/storage/upload-photo';

export async function POST(request: NextRequest) {
  try {
    const { id, first_name, last_name, class_id, custom_fields, photo_base64 } = await request.json();
    const supabase = getAdminClient();

    const { data: existing } = await supabase
      .from('students')
      .select('school_id, student_id_number, photo_url')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (first_name) updates.first_name = first_name;
    if (last_name) updates.last_name = last_name;
    if (class_id) updates.class_id = class_id;
    if (custom_fields) updates.custom_fields = custom_fields;

    if (photo_base64) {
      const storagePath = `students/${existing.school_id}/${existing.student_id_number}.jpg`;
      const { path, error: uploadErr } = await uploadBase64Photo(supabase, storagePath, photo_base64);
      if (uploadErr || !path) {
        return NextResponse.json({ error: `Photo upload failed: ${uploadErr}` }, { status: 500 });
      }
      if (existing.photo_url && existing.photo_url !== path) {
        await deleteStoragePhoto(supabase, existing.photo_url);
      }
      updates.photo_url = path;
    }

    const { error } = await supabase.from('students').update(updates).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
