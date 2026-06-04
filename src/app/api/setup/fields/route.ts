import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const { school_id, fields } = await request.json();
    const supabase = getAdminClient();

    // Delete existing fields
    await supabase.from('school_custom_fields').delete().eq('school_id', school_id);

    // Insert new fields
    const { error } = await supabase.from('school_custom_fields').insert(
      fields.map((f: any, idx: number) => ({
        school_id,
        entity_type: 'student',
        field_name: f.field_label.toLowerCase().replace(/\s+/g, '_'),
        field_label: f.field_label.trim(),
        field_type: f.field_type || 'text',
        options: f.options || null,
        is_required: f.is_required || false,
        sort_order: idx,
        is_active: true,
      }))
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
