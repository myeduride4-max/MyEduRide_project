import type { SupabaseClient } from '@supabase/supabase-js';
import { todayInLagos } from '@/lib/timezone';
import {
  loadPickupPersonsByStudents,
  type PickupPersonRow,
} from '@/lib/gate/student-pickup-context';

export type PickupPersonSummary = {
  pickup_person_name: string | null;
  pickup_person_phone: string | null;
  pickup_source: 'notice' | 'request' | 'authorised' | null;
  authorised_pickup_persons: PickupPersonRow[];
};

function normalizeEmbedded<T extends Record<string, unknown>>(raw: unknown): T | null {
  if (!raw) return null;
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== 'object') return null;
  return row as T;
}

export function summarizePickupPerson(
  studentId: string,
  ctx: {
    noticesByStudent: Record<string, { pickup_person_name?: string; pickup_person_phone?: string | null }>;
    requestsByStudent: Record<string, { pickup_person_name?: string; pickup_person_phone?: string | null }>;
    personsByStudent: Record<string, PickupPersonRow[]>;
  }
): PickupPersonSummary {
  const notice = ctx.noticesByStudent[studentId];
  const request = ctx.requestsByStudent[studentId];
  const persons = ctx.personsByStudent[studentId] || [];

  if (notice?.pickup_person_name) {
    return {
      pickup_person_name: notice.pickup_person_name,
      pickup_person_phone: notice.pickup_person_phone || null,
      pickup_source: 'notice',
      authorised_pickup_persons: persons,
    };
  }
  if (request?.pickup_person_name) {
    return {
      pickup_person_name: request.pickup_person_name,
      pickup_person_phone: request.pickup_person_phone || null,
      pickup_source: 'request',
      authorised_pickup_persons: persons,
    };
  }
  if (persons.length > 0) {
    const p = persons[0];
    return {
      pickup_person_name: p.name,
      pickup_person_phone: p.phone,
      pickup_source: 'authorised',
      authorised_pickup_persons: persons,
    };
  }
  return {
    pickup_person_name: null,
    pickup_person_phone: null,
    pickup_source: null,
    authorised_pickup_persons: persons,
  };
}

/** Load today's pickup queue with student rows and authorised pickup person details. */
export async function fetchEnrichedPickupQueue(
  supabase: SupabaseClient,
  schoolId: string,
  opts?: {
    today?: string;
    startIso?: string;
    endIso?: string;
    students?: Array<Record<string, unknown> & { id: string }>;
  }
) {
  const today = opts?.today || todayInLagos();

  let pickupQueueRaw: Array<{
    id: string;
    student_id: string;
    status: string;
    created_at: string;
    notes: string | null;
    dismissal_date: string | null;
  }> | null = null;
  let queueErr: { message: string } | null = null;

  const primary = await supabase
    .from('dismissal_requests')
    .select('id, status, created_at, notes, dismissal_date, student_id')
    .eq('school_id', schoolId)
    .eq('dismissal_date', today)
    .in('status', ['pending', 'approved'])
    .order('created_at', { ascending: true });

  pickupQueueRaw = primary.data;
  queueErr = primary.error;

  if (queueErr && opts?.startIso && opts?.endIso) {
    const fallback = await supabase
      .from('dismissal_requests')
      .select('id, status, created_at, notes, dismissal_date, student_id')
      .eq('school_id', schoolId)
      .in('status', ['pending', 'approved'])
      .gte('created_at', opts.startIso)
      .lte('created_at', opts.endIso)
      .order('created_at', { ascending: true });

    if (!fallback.error) {
      pickupQueueRaw = fallback.data;
      queueErr = null;
    }
  }

  if (queueErr) {
    return { error: queueErr.message, pickupQueue: [] as Record<string, unknown>[] };
  }

  let studentList = opts?.students;
  if (!studentList) {
    const { data } = await supabase
      .from('students')
      .select('id, first_name, last_name, student_id_number, photo_url, class:school_classes(name)')
      .eq('school_id', schoolId)
      .eq('is_active', true);
    studentList = (data || []) as Array<Record<string, unknown> & { id: string }>;
  }

  const studentById = new Map(studentList.map((s) => [s.id, s]));
  const studentIds = studentList.map((s) => s.id);

  const departedStudentIds = new Set<string>();
  if (opts?.startIso && opts?.endIso) {
    const { data: todayDepartures } = await supabase
      .from('attendance_records')
      .select('student_id')
      .eq('school_id', schoolId)
      .eq('type', 'departure')
      .gte('timestamp', opts.startIso)
      .lte('timestamp', opts.endIso);

    for (const row of todayDepartures || []) {
      departedStudentIds.add(row.student_id);
    }

    const stuckIds = (pickupQueueRaw || [])
      .filter((row) => departedStudentIds.has(String(row.student_id)))
      .map((row) => row.id);

    if (stuckIds.length > 0) {
      await supabase
        .from('dismissal_requests')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .in('id', stuckIds);
    }
  }

  const activeQueue = (pickupQueueRaw || []).filter(
    (row) => !departedStudentIds.has(String(row.student_id))
  );

  const queueStudentIds = activeQueue.map((r) => String(r.student_id));

  const personsByStudent: Record<string, PickupPersonRow[]> = {};
  const noticesByStudent: Record<
    string,
    { pickup_person_name?: string; pickup_person_phone?: string | null }
  > = {};
  const requestsByStudent: Record<
    string,
    { pickup_person_name?: string; pickup_person_phone?: string | null }
  > = {};

  if (studentIds.length > 0) {
    Object.assign(personsByStudent, await loadPickupPersonsByStudents(supabase, schoolId, studentIds));
  }

  const { data: pickupNoticesRaw } = await supabase
    .from('pickup_notices')
    .select('student_id, pickup_person_name, pickup_person_phone')
    .eq('school_id', schoolId)
    .eq('notice_date', today);

  for (const notice of pickupNoticesRaw || []) {
    if (!noticesByStudent[notice.student_id]) {
      noticesByStudent[notice.student_id] = notice;
    }
  }

  const { data: pickupRequestsRaw } = await supabase
    .from('pickup_requests')
    .select('student_id, pickup_person_name, pickup_person_phone')
    .eq('school_id', schoolId)
    .eq('request_date', today);

  for (const req of pickupRequestsRaw || []) {
    if (!requestsByStudent[req.student_id]) {
      requestsByStudent[req.student_id] = req;
    }
  }

  const ctx = { noticesByStudent, requestsByStudent, personsByStudent };

  const pickupQueue = activeQueue.map((row) => {
    const studentId = String(row.student_id);
    const student = studentById.get(studentId) || null;
    const pickup = summarizePickupPerson(studentId, ctx);
    return {
      ...row,
      student,
      ...pickup,
    };
  });

  return {
    pickupQueue,
    pickup_persons_by_student: personsByStudent,
    queueStudentIds,
  };
}

export { normalizeEmbedded };
