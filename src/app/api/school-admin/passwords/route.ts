import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest } from '@/lib/session';
import {
  fetchAllActiveSchoolRoles,
  fetchAllTeacherProfiles,
  fetchProfilesByIds,
  loadAuthPasswordsForUsers,
} from '@/lib/db/fetch-all';
import {
  fetchStudentParentCredentials,
  type StudentParentCredential,
} from '@/lib/school/student-parent-credentials';

export const dynamic = 'force-dynamic';

const STAFF_ROLES = new Set(['school_admin', 'teacher', 'gate_officer', 'staff']);

type CredentialUser = {
  id: string;
  username: string;
  full_name: string;
  roles: string[];
  password: string;
  staff_id_number?: string | null;
  linked_students?: string[];
};

type SchoolCredentials = {
  id: string;
  name: string;
  address: string | null;
  staff: CredentialUser[];
  parents: CredentialUser[];
  students: StudentParentCredential[];
  other: CredentialUser[];
  users: CredentialUser[];
  total_users: number;
};

function toUserRow(
  profile: { id: string; username: string | null; full_name: string | null },
  roles: string[],
  password: string,
  staffIdNumber?: string | null
): CredentialUser {
  return {
    id: profile.id,
    username: profile.username || '',
    full_name: profile.full_name || '',
    roles: [...roles].sort(),
    password,
    staff_id_number: staffIdNumber ?? null,
  };
}

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session?.user_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const schoolIds = Array.from(
    new Set(
      (session.roles || [])
        .filter((r) => r.role === 'school_admin')
        .map((r) => r.school_id)
        .filter(Boolean)
    )
  );

  if (schoolIds.length === 0) {
    return NextResponse.json({ error: 'School admin access required' }, { status: 403 });
  }

  try {
    const supabase = getAdminClient();

    const { data: schools, error: schoolsErr } = await supabase
      .from('schools')
      .select('id, name, address')
      .in('id', schoolIds)
      .order('name');

    if (schoolsErr) {
      return NextResponse.json({ error: schoolsErr.message }, { status: 500 });
    }

    const roleRows = await fetchAllActiveSchoolRoles(supabase, schoolIds);
    const userIds = [...new Set(roleRows.map((r) => r.user_id).filter(Boolean))];
    const [profileById, authById, staffProfiles] = await Promise.all([
      fetchProfilesByIds(supabase, userIds),
      loadAuthPasswordsForUsers(supabase, userIds),
      fetchAllTeacherProfiles(supabase, schoolIds),
    ]);

    const staffIdByUserSchool = new Map<string, string | null>();
    for (const sp of staffProfiles) {
      staffIdByUserSchool.set(`${sp.user_id}:${sp.school_id}`, sp.staff_id_number);
    }

    const rolesBySchoolUser = new Map<string, Map<string, string[]>>();
    for (const row of roleRows) {
      if (!row.school_id || !row.user_id) continue;
      if (row.role === 'super_admin') continue;

      if (!rolesBySchoolUser.has(row.school_id)) {
        rolesBySchoolUser.set(row.school_id, new Map());
      }
      const userMap = rolesBySchoolUser.get(row.school_id)!;
      if (!userMap.has(row.user_id)) userMap.set(row.user_id, []);
      userMap.get(row.user_id)!.push(row.role);
    }

    const sortUsers = (a: CredentialUser, b: CredentialUser) =>
      (a.full_name || a.username).localeCompare(b.full_name || b.username);

    const schoolCredentials: SchoolCredentials[] = [];

    for (const school of schools || []) {
      const userMap = rolesBySchoolUser.get(school.id);
      const staff: CredentialUser[] = [];
      const parents: CredentialUser[] = [];
      const other: CredentialUser[] = [];

      const students = await fetchStudentParentCredentials(
        supabase,
        school.id,
        profileById,
        authById,
        { repairMissingParents: true }
      );
      const linkedStudentsByParent = new Map<string, string[]>();
      for (const s of students) {
        if (!s.parent_user_id) continue;
        const list = linkedStudentsByParent.get(s.parent_user_id) || [];
        list.push(s.student_name);
        linkedStudentsByParent.set(s.parent_user_id, list);
      }

      if (userMap) {
        for (const [userId, roles] of userMap.entries()) {
          const profile = profileById.get(userId);
          if (!profile) continue;

          const password = authById.get(userId) || '';
          const staffId = staffIdByUserSchool.get(`${userId}:${school.id}`) ?? null;
          const row = toUserRow(profile, roles, password, staffId);
          if (linkedStudentsByParent.has(userId)) {
            row.linked_students = linkedStudentsByParent.get(userId);
          }

          const isParentOnly = roles.every((r) => r === 'parent');
          const isStaff = roles.some((r) => STAFF_ROLES.has(r));

          if (isStaff) staff.push(row);
          else if (isParentOnly) parents.push(row);
          else other.push(row);
        }
      }

      staff.sort(sortUsers);
      parents.sort(sortUsers);
      other.sort(sortUsers);
      const users = [...staff, ...parents, ...other];

      schoolCredentials.push({
        id: school.id,
        name: school.name,
        address: school.address,
        staff,
        parents,
        students,
        other,
        users,
        total_users: users.length + students.filter((s) => s.parent_user_id).length,
      });
    }

    const totalUsers = schoolCredentials.reduce((n, s) => n + s.total_users, 0);
    const totalStudents = schoolCredentials.reduce((n, s) => n + s.students.length, 0);
    const totalParents = schoolCredentials.reduce((n, s) => n + s.parents.length, 0);
    const totalStaff = schoolCredentials.reduce((n, s) => n + s.staff.length, 0);

    return NextResponse.json({
      schools: schoolCredentials,
      total_users: totalUsers,
      total_students: totalStudents,
      total_parents: totalParents,
      total_staff: totalStaff,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load credentials';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
