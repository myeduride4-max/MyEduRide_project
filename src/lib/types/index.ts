// ============ ENUMS ============

export type UserRole = 'super_admin' | 'school_admin' | 'teacher' | 'gate_officer' | 'parent';

export type AttendanceType = 'arrival' | 'departure';

export type VerificationMethod = 'face_recognition' | 'id_card_scan' | 'manual';

export type AttendanceStatus = 'on_time' | 'late' | 'absent';

export type DismissalStatus = 'pending' | 'approved' | 'completed';

export type GateSessionStatus = 'active' | 'closed';

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'email' | 'phone' | 'textarea';

export type EntityType = 'student' | 'teacher';

export type SetupStep = 'classes' | 'fields' | 'teachers' | 'students' | 'complete';

export type NotificationChannel = 'email' | 'push' | 'both';

// ============ DATABASE MODELS ============

export interface School {
  id: string;
  name: string;
  address: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  gate_open_time: string;
  school_start_time: string;
  late_threshold: string;
  gate_close_time: string;
  dismissal_start_time: string;
  dismissal_end_time: string;
  setup_completed: boolean;
  setup_step: SetupStep;
  approval_status?: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface SchoolClass {
  id: string;
  school_id: string;
  name: string;
  grade: string;
  section: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface SchoolCustomField {
  id: string;
  school_id: string;
  entity_type: EntityType;
  field_name: string;
  field_label: string;
  field_type: FieldType;
  options: string[] | null; // For select fields
  is_required: boolean;
  placeholder: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSchoolRole {
  id: string;
  user_id: string;
  school_id: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface Student {
  id: string;
  school_id: string;
  class_id: string;
  first_name: string;
  last_name: string;
  student_id_number: string;
  photo_url: string | null;
  face_descriptor: number[] | null;
  qr_code_data: string;
  custom_fields: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StudentParent {
  id: string;
  student_id: string;
  parent_user_id: string;
  relationship: string;
  is_primary: boolean;
  created_at: string;
}

export interface TeacherProfile {
  id: string;
  user_id: string;
  school_id: string;
  staff_id_number: string | null;
  qr_code_data: string | null;
  photo_url: string | null;
  face_descriptor: number[] | null;
  custom_fields: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface TeacherClassAssignment {
  id: string;
  teacher_profile_id: string;
  class_id: string;
  is_primary: boolean;
  created_at: string;
}

export interface StaffAttendance {
  id: string;
  user_id: string;
  school_id: string;
  gate_session_id: string | null;
  type: 'clock_in' | 'clock_out';
  verification_method: VerificationMethod;
  verified_by_user_id: string | null;
  timestamp: string;
  notes: string | null;
  created_at: string;
}

export interface GateSession {
  id: string;
  school_id: string;
  gate_officer_user_id: string;
  mode: 'arrival' | 'dismissal';
  status: GateSessionStatus;
  started_at: string;
  ended_at: string | null;
}

export interface AttendanceRecord {
  id: string;
  student_id: string;
  school_id: string;
  gate_session_id: string;
  type: AttendanceType;
  verification_method: VerificationMethod;
  verified_by_user_id: string;
  status: AttendanceStatus;
  source: 'gate' | 'teacher';
  timestamp: string;
  notes: string | null;
  created_at: string;
}

export interface DismissalRequest {
  id: string;
  student_id: string;
  school_id: string;
  requested_by_user_id: string;
  status: DismissalStatus;
  notes: string | null;
  extra_lesson_until: string | null;
  approved_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  school_id: string;
  student_id: string | null;
  title: string;
  message: string;
  type: 'arrival' | 'departure' | 'late' | 'dismissal' | 'system';
  is_read: boolean;
  email_sent: boolean;
  push_sent: boolean;
  created_at: string;
}

export interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
  created_at: string;
}

// ============ UI TYPES ============

export interface StudentWithClass extends Student {
  class: SchoolClass;
}

export interface StudentWithParents extends Student {
  parents: (StudentParent & { profile: UserProfile })[];
  class: SchoolClass;
}

export interface AttendanceRecordWithStudent extends AttendanceRecord {
  student: Student & { class?: SchoolClass };
}

export interface DashboardStats {
  total_students: number;
  present_today: number;
  absent_today: number;
  late_today: number;
  dismissed_today: number;
}

export interface ClassWithTeacher extends SchoolClass {
  teacher: UserProfile | null;
  student_count: number;
}
