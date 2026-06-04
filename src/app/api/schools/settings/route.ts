import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest, sessionHasRole } from '@/lib/session';
import { TIME_FIELDS, timeInputToDb } from '@/lib/time-input';
import { fetchSchoolSettings, updateSchoolSettings } from '@/lib/school-settings-db';

export const dynamic = 'force-dynamic';

function canEditSchool(
  session: NonNullable<ReturnType<typeof getSessionFromRequest>>,
  schoolId: string
): boolean {
  if (sessionHasRole(session, 'super_admin')) return true;
  return session.roles.some(
    (r) => r.role === 'school_admin' && r.school_id === schoolId
  );
}

function canViewSchool(
  session: NonNullable<ReturnType<typeof getSessionFromRequest>>,
  schoolId: string
): boolean {
  if (sessionHasRole(session, 'super_admin')) return true;
  return session.roles.some((r) => r.school_id === schoolId);
}

/** GET /api/schools/settings?school_id=xxx */
export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const schoolId = request.nextUrl.searchParams.get('school_id');
    if (!schoolId) {
      return NextResponse.json({ error: 'school_id required' }, { status: 400 });
    }
    if (!canViewSchool(session, schoolId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const supabase = getAdminClient();
    const { data, error, timeColumnsAvailable } = await fetchSchoolSettings(supabase, schoolId);

    if (error || !data) {
      return NextResponse.json({ error: error || 'School not found' }, { status: 500 });
    }

    return NextResponse.json({
      school: data,
      time_columns_available: timeColumnsAvailable,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load settings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/schools/settings
 * body: { school_id, name?, address?, ... gate times ... }
 */
export async function PUT(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await request.json();
    const schoolId = body.school_id as string | undefined;
    if (!schoolId) {
      return NextResponse.json({ error: 'school_id required' }, { status: 400 });
    }

    if (!canEditSchool(session, schoolId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const trimmed = String(body.name).trim();
      if (!trimmed) {
        return NextResponse.json({ error: 'School name is required' }, { status: 400 });
      }
      updates.name = trimmed;
    }
    if (body.address !== undefined) updates.address = body.address?.trim() || null;
    if (body.logo_url !== undefined) updates.logo_url = body.logo_url?.trim() || null;
    if (body.principal_signature_url !== undefined) {
      updates.principal_signature_url = body.principal_signature_url?.trim() || null;
    }
    if (body.welcome_message !== undefined) updates.welcome_message = body.welcome_message?.trim() || null;
    if (body.primary_color !== undefined) updates.primary_color = body.primary_color;
    if (body.secondary_color !== undefined) updates.secondary_color = body.secondary_color;

    for (const field of TIME_FIELDS) {
      if (body[field] === undefined) continue;
      const raw = String(body[field]).trim();
      if (!raw) continue;
      const dbTime = timeInputToDb(raw);
      if (dbTime) updates[field] = dbTime;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const supabase = getAdminClient();
    const result = await updateSchoolSettings(supabase, schoolId, updates);

    if (result.error) {
      return NextResponse.json(
        { error: result.error, migration_required: result.migrationRequired },
        { status: result.migrationRequired ? 503 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      school: result.data,
      migration_required: result.migrationRequired || false,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save settings';
    console.error('[schools/settings PUT]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
