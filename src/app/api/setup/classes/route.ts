import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const { school_id, classes } = await request.json();
    const supabase = getAdminClient();

    // Delete existing classes for this school
    await supabase.from('school_classes').delete().eq('school_id', school_id);

    // Insert new classes
    const { error } = await supabase.from('school_classes').insert(
      classes.map((c: any, idx: number) => ({
        school_id,
        name: c.name.trim(),
        grade: c.grade?.trim() || c.name.trim(),
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
