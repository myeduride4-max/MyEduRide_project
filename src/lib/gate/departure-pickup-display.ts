import type { SupabaseClient } from '@supabase/supabase-js';
import { chunkArray } from '@/lib/db/fetch-all';

export type DeparturePickupPerson = {
  pickup_person_name: string;
  pickup_person_phone?: string | null;
  pickup_source: 'release' | 'notice' | 'request' | 'authorised';
  notes?: string | null;
};

type PickupMaps = {
  byAttendanceId: Map<string, DeparturePickupPerson>;
  byStudentId: Map<string, DeparturePickupPerson>;
  noticeByStudent: Map<string, DeparturePickupPerson>;
  requestByStudent: Map<string, DeparturePickupPerson>;
  authorisedByStudent: Map<string, DeparturePickupPerson>;
};

export async function loadDeparturePickupMaps(
  supabase: SupabaseClient,
  schoolId: string,
  dateParam: string,
  startIso: string,
  endIso: string
): Promise<PickupMaps> {
  const byAttendanceId = new Map<string, DeparturePickupPerson>();
  const byStudentId = new Map<string, DeparturePickupPerson>();
  const noticeByStudent = new Map<string, DeparturePickupPerson>();
  const requestByStudent = new Map<string, DeparturePickupPerson>();
  const authorisedByStudent = new Map<string, DeparturePickupPerson>();

  const { data: gateLogs } = await supabase
    .from('gate_activity_logs')
    .select('student_id, pickup_person_name, pickup_person_phone, details, action_type, created_at')
    .eq('school_id', schoolId)
    .gte('created_at', startIso)
    .lte('created_at', endIso)
    .in('action_type', ['release', 'manual_override', 'check_out'])
    .order('created_at', { ascending: false });

  for (const log of gateLogs || []) {
    if (!log.pickup_person_name?.trim()) continue;
    const person: DeparturePickupPerson = {
      pickup_person_name: log.pickup_person_name.trim(),
      pickup_person_phone: log.pickup_person_phone || null,
      pickup_source: 'release',
    };
    const details = (log.details || {}) as { attendance_record_id?: string };
    if (details.attendance_record_id) {
      byAttendanceId.set(details.attendance_record_id, person);
    }
    if (log.student_id && !byStudentId.has(log.student_id)) {
      byStudentId.set(log.student_id, person);
    }
  }

  const { data: notices } = await supabase
    .from('pickup_notices')
    .select('student_id, pickup_person_name, pickup_person_phone, notes')
    .eq('school_id', schoolId)
    .eq('notice_date', dateParam);

  for (const n of notices || []) {
    if (!n.student_id || !n.pickup_person_name?.trim()) continue;
    noticeByStudent.set(n.student_id, {
      pickup_person_name: n.pickup_person_name.trim(),
      pickup_person_phone: n.pickup_person_phone || null,
      pickup_source: 'notice',
      notes: n.notes || null,
    });
  }

  const { data: requests } = await supabase
    .from('pickup_requests')
    .select('student_id, pickup_person_name, pickup_person_phone')
    .eq('school_id', schoolId)
    .eq('request_date', dateParam);

  for (const r of requests || []) {
    if (!r.student_id || !r.pickup_person_name?.trim()) continue;
    requestByStudent.set(r.student_id, {
      pickup_person_name: r.pickup_person_name.trim(),
      pickup_person_phone: r.pickup_person_phone || null,
      pickup_source: 'request',
    });
  }

  const { data: students } = await supabase
    .from('students')
    .select('id')
    .eq('school_id', schoolId)
    .eq('is_active', true);

  const studentIds = (students || []).map((s) => s.id);
  if (studentIds.length > 0) {
    for (const batch of chunkArray(studentIds)) {
      const { data: links } = await supabase
        .from('pickup_person_students')
        .select(`
          student_id,
          pickup_person:pickup_persons(name, phone)
        `)
        .eq('school_id', schoolId)
        .in('student_id', batch);

      for (const link of links || []) {
        if (authorisedByStudent.has(link.student_id)) continue;
        const raw = link.pickup_person as { name?: string; phone?: string | null } | { name?: string; phone?: string | null }[] | null;
        const person = Array.isArray(raw) ? raw[0] : raw;
        if (!person?.name?.trim()) continue;
        authorisedByStudent.set(link.student_id, {
          pickup_person_name: person.name.trim(),
          pickup_person_phone: person.phone || null,
          pickup_source: 'authorised',
        });
      }
    }
  }

  return {
    byAttendanceId,
    byStudentId,
    noticeByStudent,
    requestByStudent,
    authorisedByStudent,
  };
}

export function resolveDeparturePickupPerson(
  maps: PickupMaps,
  attendanceRecordId: string,
  studentId: string | null
): DeparturePickupPerson | null {
  return (
    maps.byAttendanceId.get(attendanceRecordId) ||
    (studentId ? maps.byStudentId.get(studentId) : null) ||
    (studentId ? maps.noticeByStudent.get(studentId) : null) ||
    (studentId ? maps.requestByStudent.get(studentId) : null) ||
    (studentId ? maps.authorisedByStudent.get(studentId) : null) ||
    null
  );
}
