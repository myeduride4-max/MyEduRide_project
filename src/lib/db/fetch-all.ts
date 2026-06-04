import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAuthUserForProfile } from '@/lib/auth/update-password';

export const DB_PAGE_SIZE = 1000;
const IN_QUERY_BATCH_SIZE = 150;

export function chunkArray<T>(items: T[], size = IN_QUERY_BATCH_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

type SchoolRoleRow = { user_id: string; school_id: string; role: string };

/** Paginate past Supabase default 1000-row cap on user_school_roles. */
export async function fetchAllActiveSchoolRoles(
  supabase: SupabaseClient,
  schoolIds?: string[]
): Promise<SchoolRoleRow[]> {
  const rows: SchoolRoleRow[] = [];
  let offset = 0;

  while (true) {
    let q = supabase
      .from('user_school_roles')
      .select('user_id, school_id, role')
      .eq('is_active', true)
      .range(offset, offset + DB_PAGE_SIZE - 1);

    if (schoolIds?.length) {
      q = q.in('school_id', schoolIds);
    }

    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as SchoolRoleRow[]));
    if (data.length < DB_PAGE_SIZE) break;
    offset += DB_PAGE_SIZE;
  }

  return rows;
}

type TeacherProfileRow = {
  user_id: string;
  school_id: string;
  staff_id_number: string | null;
};

export async function fetchAllTeacherProfiles(
  supabase: SupabaseClient,
  schoolIds?: string[]
): Promise<TeacherProfileRow[]> {
  const rows: TeacherProfileRow[] = [];
  let offset = 0;

  while (true) {
    let q = supabase
      .from('teacher_profiles')
      .select('user_id, school_id, staff_id_number')
      .range(offset, offset + DB_PAGE_SIZE - 1);

    if (schoolIds?.length) {
      q = q.in('school_id', schoolIds);
    }

    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as TeacherProfileRow[]));
    if (data.length < DB_PAGE_SIZE) break;
    offset += DB_PAGE_SIZE;
  }

  return rows;
}

export async function fetchProfilesByIds(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<
  Map<string, { id: string; username: string | null; full_name: string | null }>
> {
  const profileById = new Map<
    string,
    { id: string; username: string | null; full_name: string | null }
  >();

  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  for (const batch of chunkArray(uniqueIds)) {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, username, full_name')
      .in('id', batch);

    if (error) throw error;
    for (const p of data || []) {
      profileById.set(p.id, p);
    }
  }

  return profileById;
}

export async function loadAuthPasswordsForUsers(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, string>> {
  const authById = new Map<string, string>();
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return authById;

  for (const batch of chunkArray(uniqueIds, 25)) {
    await Promise.all(
      batch.map(async (userId) => {
        try {
          const resolved = await resolveAuthUserForProfile(supabase, userId);
          if ('error' in resolved) return;
          const pw = (resolved.user.user_metadata?.login_password as string) || '';
          authById.set(userId, pw);
        } catch {
          /* skip */
        }
      })
    );
  }

  return authById;
}
