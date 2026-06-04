import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const { school_id } = await request.json();
    const supabase = getAdminClient();

    await supabase.from('schools').update({ setup_completed: true, setup_step: 'complete' }).eq('id', school_id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
