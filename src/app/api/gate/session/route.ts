import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest } from '@/lib/session';
import { canManageGateSession } from '@/lib/gate/access';

/** Start or end a gate officer scanning session (links attendance to gate_sessions). */
export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { action, school_id, mode, session_id } = body;
    const supabase = getAdminClient();

    if (action === 'end') {
      if (!session_id) {
        return NextResponse.json({ error: 'session_id required' }, { status: 400 });
      }
      const { error } = await supabase
        .from('gate_sessions')
        .update({ status: 'closed', ended_at: new Date().toISOString() })
        .eq('id', session_id)
        .eq('gate_officer_user_id', session.user_id);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (action !== 'start') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (!school_id) {
      return NextResponse.json({ error: 'school_id required' }, { status: 400 });
    }

    if (!canManageGateSession(session, school_id)) {
      return NextResponse.json({ error: 'Gate officer access required' }, { status: 403 });
    }

    if (!['arrival', 'dismissal'].includes(mode)) {
      return NextResponse.json({ error: 'mode must be arrival or dismissal' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('gate_sessions')
      .insert({
        school_id,
        gate_officer_user_id: session.user_id,
        mode,
        status: 'active',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[gate/session] start failed:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, session_id: data.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Session error' }, { status: 500 });
  }
}
