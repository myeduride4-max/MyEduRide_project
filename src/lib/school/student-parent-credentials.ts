import type { SupabaseClient } from '@supabase/supabase-js';
import {
  chunkArray,
  fetchProfilesByIds,
  loadAuthPasswordsForUsers,
} from '@/lib/db/fetch-all';
import {
  parentInfoFromCustomFields,
  provisionParentForStudent,
} from '@/lib/school/provision-parent-for-student';
import { loadPickupPersonsByStudents } from '@/lib/gate/student-pickup-context';

export type AuthorisedPickupPerson = {
  id: string;
  name: string;
  phone: string | null;
  relationship: string | null;
};

export type StudentParentCredential = {
  student_id: string;
  student_name: string;
  student_id_number: string;
  class_name: string | null;
  parent_user_id: string | null;
  parent_name: string;
  parent_username: string;
  parent_username_on_file: string;
  password: string;
  parent_on_file_name: string;
  parent_phone: string | null;
  parent_email: string | null;
  authorised_pickup_persons: AuthorisedPickupPerson[];
  primary_pickup_person: string | null;
  needs_parent_account: boolean;
};

function mapPickupRows(
  rows: Array<{ id: string; name: string; phone: string | null; relationship: string }>
): AuthorisedPickupPerson[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    relationship: row.relationship,
  }));
}

export async function fetchStudentParentCredentials(
  supabase: SupabaseClient,
  schoolId: string,
  profileById: Map<string, { id: string; username: string | null; full_name: string | null }>,
  authById: Map<string, string>,
  opts?: { repairMissingParents?: boolean }
): Promise<StudentParentCredential[]> {
  const { data: students, error: studErr } = await supabase
    .from('students')
    .select('id, first_name, last_name, student_id_number, custom_fields, class:school_classes(name)')
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .order('last_name');

  if (studErr || !students?.length) return [];

  const studentIds = students.map((s) => s.id);
  const parentLinks: Array<{
    student_id: string;
    parent_user_id: string;
    is_primary: boolean;
  }> = [];

  for (const batch of chunkArray(studentIds)) {
    const { data: links } = await supabase
      .from('student_parents')
      .select('student_id, parent_user_id, is_primary')
      .in('student_id', batch);
    if (links?.length) parentLinks.push(...links);
  }

  const pickupByStudent = new Map<string, AuthorisedPickupPerson[]>();
  const pickupRowsByStudent = await loadPickupPersonsByStudents(supabase, schoolId, studentIds);
  for (const [studentId, rows] of Object.entries(pickupRowsByStudent)) {
    pickupByStudent.set(studentId, mapPickupRows(rows));
  }

  if (opts?.repairMissingParents) {
    for (const student of students) {
      const onFile = parentInfoFromCustomFields(
        student.custom_fields as Record<string, string> | null
      );
      const existingLinks = parentLinks.filter((l) => l.student_id === student.id);
      const primaryLink =
        existingLinks.find((l) => l.is_primary) || existingLinks[0] || null;

      let needsProvision =
        !primaryLink &&
        (!!onFile.parent_name || !!onFile.parent_username || !!onFile.parent_email);
      if (primaryLink) {
        let profile = profileById.get(primaryLink.parent_user_id);
        if (!profile) {
          const fetched = await fetchProfilesByIds(supabase, [primaryLink.parent_user_id]);
          profile = fetched.get(primaryLink.parent_user_id);
          if (profile) profileById.set(primaryLink.parent_user_id, profile);
        }
        if (!profile?.username?.trim()) {
          needsProvision = true;
        }
      }

      if (!needsProvision) continue;

      const parentName =
        onFile.parent_name ||
        onFile.parent_username ||
        (onFile.parent_email ? onFile.parent_email.split('@')[0] : '') ||
        profileById.get(primaryLink?.parent_user_id || '')?.full_name ||
        '';
      if (!parentName && !onFile.parent_username && !onFile.parent_email) continue;

      const result = await provisionParentForStudent(supabase, {
        student_id: student.id,
        school_id: schoolId,
        parent_name: parentName,
        parent_username: onFile.parent_username,
        parent_email: onFile.parent_email,
        parent_phone: onFile.parent_phone,
        relationship: onFile.relationship,
      });

      if ('parent_user_id' in result) {
        if (!existingLinks.some((l) => l.parent_user_id === result.parent_user_id)) {
          parentLinks.push({
            student_id: student.id,
            parent_user_id: result.parent_user_id,
            is_primary: true,
          });
        }
        profileById.set(result.parent_user_id, {
          id: result.parent_user_id,
          username: result.parent_username,
          full_name: parentName,
        });
        authById.set(result.parent_user_id, result.password);
      }
    }
  }

  const parentIdsToLoad = [
    ...new Set(parentLinks.map((l) => l.parent_user_id).filter(Boolean)),
  ].filter((id) => !profileById.has(id));

  if (parentIdsToLoad.length) {
    const extraProfiles = await fetchProfilesByIds(supabase, parentIdsToLoad);
    for (const [id, p] of extraProfiles) profileById.set(id, p);

    const extraPasswords = await loadAuthPasswordsForUsers(supabase, parentIdsToLoad);
    for (const [id, pw] of extraPasswords) authById.set(id, pw);
  }

  const linksByStudent = new Map<string, typeof parentLinks>();
  for (const link of parentLinks) {
    if (!linksByStudent.has(link.student_id)) linksByStudent.set(link.student_id, []);
    linksByStudent.get(link.student_id)!.push(link);
  }

  const rows: StudentParentCredential[] = [];

  for (const student of students) {
    const cls = student.class as { name?: string } | { name?: string }[] | null;
    const className = Array.isArray(cls) ? cls[0]?.name : cls?.name;
    const onFile = parentInfoFromCustomFields(
      student.custom_fields as Record<string, string> | null
    );
    const authorised = pickupByStudent.get(student.id) || [];
    const links = linksByStudent.get(student.id) || [];
    const primary = links.find((l) => l.is_primary) || links[0] || null;

    let parentUserId: string | null = null;
    let parentName = onFile.parent_name;
    let parentUsername = '';
    let password = '';

    if (primary?.parent_user_id) {
      parentUserId = primary.parent_user_id;
      const profile = profileById.get(parentUserId);
      parentName = profile?.full_name || onFile.parent_name;
      parentUsername = profile?.username?.trim() || '';
      password = authById.get(parentUserId) || '';
    }

    rows.push({
      student_id: student.id,
      student_name: `${student.first_name} ${student.last_name}`.trim(),
      student_id_number: student.student_id_number || '',
      class_name: className || null,
      parent_user_id: parentUserId,
      parent_name: parentName,
      parent_username: parentUsername,
      parent_username_on_file: onFile.parent_username || '',
      password,
      parent_on_file_name: onFile.parent_name,
      parent_phone: onFile.parent_phone,
      parent_email: onFile.parent_email,
      authorised_pickup_persons: authorised,
      primary_pickup_person: authorised[0]?.name || null,
      needs_parent_account:
        (!parentUserId && (!!onFile.parent_name || !!onFile.parent_username || !!onFile.parent_email)) ||
        (!!parentUserId && !parentUsername),
    });
  }

  return rows;
}
