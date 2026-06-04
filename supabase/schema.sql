-- ============================================
-- MyEduRide — Complete Database Schema (single source of truth)
-- ============================================
--
-- HOW TO USE (new Supabase project):
--   1. Create a Supabase project with Auth enabled.
--   2. Open SQL Editor → New query → paste this ENTIRE file → Run.
--   3. Set app env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
--   4. Create your first super-admin via app env SUPER_ADMIN_USERNAMES (see src/lib/auth/super-admin.ts).
--
-- This file replaces all files under supabase/migrations/ (merged below).
-- Do NOT run this on a database that already has these tables unless you intend to reset.
--
-- MERGED MIGRATIONS (included inline — no separate migration run needed):
--   • schools.approval_status — pending | approved | rejected (self-registration workflow)
--   • school_classes unique (school_id, name, section) — same class name, different arm/section
--   • dismissal_requests.dismissal_date — Lagos calendar day, one request per student per day
--
-- AUTH: username + password (NOT email). See user_profiles.username.
--
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============ SCHOOLS ============
CREATE TABLE schools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT,
  logo_url TEXT,
  principal_signature_url TEXT,
  welcome_message TEXT,
  primary_color TEXT DEFAULT '#1B4D3E',
  secondary_color TEXT DEFAULT '#D4A017',
  gate_open_time TIME DEFAULT '06:30',
  school_start_time TIME DEFAULT '08:00',
  late_threshold TIME DEFAULT '08:15',
  gate_close_time TIME DEFAULT '09:00',
  dismissal_start_time TIME DEFAULT '14:00',
  dismissal_end_time TIME DEFAULT '16:00',
  timezone TEXT DEFAULT 'Africa/Lagos',
  setup_completed BOOLEAN DEFAULT FALSE,
  setup_step TEXT DEFAULT 'classes' CHECK (setup_step IN ('classes', 'fields', 'teachers', 'students', 'complete')),
  approval_status TEXT NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ SCHOOL CLASSES ============
CREATE TABLE school_classes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grade TEXT NOT NULL,
  section TEXT,
  assigned_teacher_id UUID,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Same display name allowed when section/arm differs (e.g. Primary 4 A vs Primary 4 B).
CREATE UNIQUE INDEX school_classes_school_id_name_section_key
  ON school_classes (school_id, name, COALESCE(section, ''));

-- ============ SCHOOL CUSTOM FIELDS ============
CREATE TABLE school_custom_fields (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('student', 'teacher')),
  field_name TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'date', 'select', 'email', 'phone', 'textarea')),
  options JSONB,
  is_required BOOLEAN DEFAULT FALSE,
  placeholder TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, entity_type, field_name)
);

-- ============ USER PROFILES ============
-- LOGIN: username + password (NOT email).
-- email is optional contact info for notifications only.
-- Supabase Auth stores users with internal email: {username}@login.myeduride.internal (see src/lib/auth/username.ts).
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  email TEXT,
  full_name TEXT NOT NULL,
  phone TEXT UNIQUE,
  auth_preference TEXT NOT NULL DEFAULT 'password' CHECK (auth_preference = 'password'),
  failed_login_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_password_change_at TIMESTAMPTZ,
  parent_requires_photo_for_pickup BOOLEAN DEFAULT false,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT user_profiles_username_format CHECK (username ~ '^[a-z0-9][a-z0-9._]{2,31}$')
);

-- ============ USER SCHOOL ROLES ============
CREATE TABLE user_school_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'school_admin', 'teacher', 'gate_officer', 'parent', 'staff')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, school_id, role)
);

-- ============ SCHOOL CUSTOM ROLES (job titles for staff) ============
CREATE TABLE school_custom_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  can_assign_class BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, slug)
);

-- ============ TEACHER PROFILES ============
CREATE TABLE teacher_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id_number TEXT UNIQUE,
  qr_code_data TEXT UNIQUE,
  photo_url TEXT,
  face_descriptor JSONB,
  custom_fields JSONB DEFAULT '{}',
  custom_role_id UUID REFERENCES school_custom_roles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, school_id)
);

-- Add FK from school_classes to teacher_profiles
ALTER TABLE school_classes
  ADD CONSTRAINT school_classes_assigned_teacher_id_fkey
  FOREIGN KEY (assigned_teacher_id) REFERENCES teacher_profiles(id) ON DELETE SET NULL;

-- ============ TEACHER CLASS ASSIGNMENTS ============
CREATE TABLE teacher_class_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_profile_id UUID NOT NULL REFERENCES teacher_profiles(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(teacher_profile_id, class_id)
);

-- ============ STUDENTS ============
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES school_classes(id) ON DELETE RESTRICT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  student_id_number TEXT UNIQUE NOT NULL,
  photo_url TEXT,
  face_descriptor JSONB,
  qr_code_data TEXT UNIQUE NOT NULL,
  custom_fields JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ STUDENT-PARENT LINKS ============
CREATE TABLE student_parents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  relationship TEXT DEFAULT 'parent',
  is_primary BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, parent_user_id)
);

-- ============ GATE SESSIONS ============
CREATE TABLE gate_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  gate_officer_user_id UUID NOT NULL REFERENCES user_profiles(id),
  mode TEXT NOT NULL CHECK (mode IN ('arrival', 'dismissal')),
  status TEXT NOT NULL CHECK (status IN ('active', 'closed')) DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- ============ SCHOOL CALENDAR SETTINGS ============
CREATE TABLE school_calendar_settings (
  school_id UUID PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  weekend_days SMALLINT[] NOT NULL DEFAULT ARRAY[0,6],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ ATTENDANCE RECORDS (Students) ============
CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  gate_session_id UUID REFERENCES gate_sessions(id),
  type TEXT NOT NULL CHECK (type IN ('arrival', 'departure')),
  verification_method TEXT NOT NULL CHECK (verification_method IN ('face_recognition', 'id_card_scan', 'manual', 'teacher_manual')),
  verified_by_user_id UUID REFERENCES user_profiles(id),
  status TEXT CHECK (status IN ('on_time', 'late', 'absent')) DEFAULT 'on_time',
  source TEXT NOT NULL DEFAULT 'gate' CHECK (source IN ('gate', 'teacher')),
  minutes_late INT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ STAFF ATTENDANCE ============
CREATE TABLE staff_attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  gate_session_id UUID REFERENCES gate_sessions(id),
  type TEXT NOT NULL CHECK (type IN ('clock_in', 'clock_out')),
  verification_method TEXT NOT NULL CHECK (verification_method IN ('face_recognition', 'id_card_scan', 'manual')),
  verified_by_user_id UUID REFERENCES user_profiles(id),
  record_source TEXT DEFAULT 'gate' CHECK (record_source IN ('gate', 'admin')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ DISMISSAL REQUESTS ============
-- Teacher marks student "Ready for Pickup" → creates a dismissal_request
-- Gate officer confirms release → status = 'completed'
-- UNIQUE(student_id, dismissal_date) prevents double-tap per day
CREATE TABLE dismissal_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  requested_by_user_id UUID NOT NULL REFERENCES user_profiles(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'completed')) DEFAULT 'pending',
  notes TEXT,
  extra_lesson_until TIME,
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  dismissal_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, dismissal_date)
);

-- ============ EXTRA LESSONS ============
-- Teacher marks student as staying for extra lesson (not ready for pickup yet)
CREATE TABLE extra_lessons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_user_id UUID NOT NULL REFERENCES user_profiles(id),
  lesson_end_time TIME,
  date DATE DEFAULT CURRENT_DATE,
  is_released BOOLEAN DEFAULT FALSE,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, date)
);

-- ============ PARENT PICKUP NOTICES ============
CREATE TABLE pickup_notices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  parent_user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  pickup_person_name TEXT NOT NULL,
  pickup_person_phone TEXT,
  relationship TEXT DEFAULT 'authorized pickup',
  is_self_pickup BOOLEAN DEFAULT FALSE,
  notes TEXT,
  notice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ PICKUP PERSONS ============
-- Authorised pickup persons registered per student (with photo for gate verification)
CREATE TABLE pickup_persons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  phone TEXT,
  photo_url TEXT,
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ PICKUP PERSON STUDENT LINKS ============
-- One pickup person can be linked to multiple students (e.g. a driver for siblings)
CREATE TABLE pickup_person_students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pickup_person_id UUID NOT NULL REFERENCES pickup_persons(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pickup_person_id, student_id)
);

-- ============ PICKUP REQUESTS ============
-- Parent sends a message to school: "Today, [Person] will pick up my child"
CREATE TABLE pickup_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_user_id UUID NOT NULL REFERENCES user_profiles(id),
  pickup_person_name TEXT NOT NULL,
  pickup_person_phone TEXT,
  message TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'completed')),
  acknowledged_by UUID REFERENCES user_profiles(id),
  acknowledged_at TIMESTAMPTZ,
  request_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ NOTIFICATIONS ============
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('arrival', 'departure', 'late', 'dismissal', 'system', 'pickup_request', 'pickup_person')),
  is_read BOOLEAN DEFAULT FALSE,
  email_sent BOOLEAN DEFAULT FALSE,
  push_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ PUSH SUBSCRIPTIONS ============
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

-- ============ OTP CODES (legacy — OTP login disabled; username + password only) ============
CREATE TABLE otp_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username TEXT,
  email TEXT,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ SCHOOL NON-SCHOOL DAYS (holidays, closures) ============
CREATE TABLE school_non_school_days (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  calendar_date DATE NOT NULL,
  day_type TEXT NOT NULL CHECK (day_type IN ('public_holiday', 'school_event', 'closure')),
  title TEXT NOT NULL,
  description TEXT,
  notify_parents BOOLEAN DEFAULT false,
  batch_id UUID,
  range_end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, calendar_date)
);

-- ============ GATE DAY OVERRIDES (non-school day exceptions) ============
CREATE TABLE gate_day_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  override_date DATE NOT NULL,
  reason TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, override_date)
);

-- ============ STUDENT CLASS PROMOTIONS ============
CREATE TABLE student_class_promotions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  from_class_id UUID REFERENCES school_classes(id),
  to_class_id UUID NOT NULL REFERENCES school_classes(id),
  effective_term TEXT,
  effective_date DATE NOT NULL,
  promoted_by UUID NOT NULL REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ GATE ACTIVITY LOGS ============
CREATE TABLE gate_activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  gate_officer_user_id UUID REFERENCES user_profiles(id),
  student_id UUID REFERENCES students(id),
  action_type TEXT NOT NULL CHECK (
    action_type IN ('check_in', 'check_out', 'release', 'manual_override', 'clock_in', 'clock_out')
  ),
  pickup_person_name TEXT,
  pickup_person_phone TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ AUTH SECURITY EVENTS ============
-- identifier stores username (login id), not email
CREATE TABLE auth_security_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  identifier TEXT,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('login_success', 'login_failed', 'account_locked', 'password_reset_requested', 'password_changed', 'session_timeout', '2fa_verified')
  ),
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ PASSWORD RESET REQUESTS ============
-- identifier stores username (login id), not email
CREATE TABLE password_reset_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  identifier TEXT NOT NULL,
  reset_method TEXT NOT NULL CHECK (reset_method IN ('sms', 'email', 'support')),
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ AUDIT LOGS ============
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ INDEXES ============
CREATE INDEX idx_schools_approval_status ON schools(approval_status);
CREATE INDEX idx_school_classes_school ON school_classes(school_id);
CREATE INDEX idx_custom_fields_school ON school_custom_fields(school_id, entity_type);
CREATE INDEX idx_students_school ON students(school_id);
CREATE INDEX idx_students_class ON students(class_id);
CREATE INDEX idx_students_qr ON students(qr_code_data);
CREATE INDEX idx_students_id_number ON students(student_id_number);
CREATE INDEX idx_teacher_profiles_school ON teacher_profiles(school_id);
CREATE INDEX idx_teacher_class_assignments ON teacher_class_assignments(class_id);
CREATE INDEX idx_teacher_class_teacher ON teacher_class_assignments(teacher_profile_id);
CREATE INDEX idx_attendance_student ON attendance_records(student_id);
CREATE INDEX idx_attendance_school_date ON attendance_records(school_id, timestamp);
CREATE INDEX idx_attendance_session ON attendance_records(gate_session_id);
CREATE INDEX idx_attendance_school_type_ts ON attendance_records(school_id, type, timestamp);
CREATE INDEX idx_staff_attendance_user ON staff_attendance(user_id, timestamp);
CREATE INDEX idx_staff_attendance_school ON staff_attendance(school_id, timestamp);
CREATE INDEX idx_dismissal_student ON dismissal_requests(student_id);
CREATE INDEX idx_dismissal_school ON dismissal_requests(school_id, created_at);
CREATE INDEX idx_dismissal_school_status ON dismissal_requests(school_id, status, dismissal_date);
CREATE INDEX idx_extra_lessons_student_date ON extra_lessons(student_id, date);
CREATE INDEX idx_extra_lessons_school ON extra_lessons(school_id, date);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_user_profiles_username ON user_profiles(username);
CREATE INDEX idx_user_profiles_email ON user_profiles(email) WHERE email IS NOT NULL;
CREATE INDEX idx_user_roles ON user_school_roles(user_id);
CREATE INDEX idx_user_roles_school ON user_school_roles(school_id, role);
CREATE INDEX idx_student_parents ON student_parents(parent_user_id);
CREATE INDEX idx_pickup_notices_school_date ON pickup_notices(school_id, notice_date);
CREATE INDEX idx_pickup_notices_student ON pickup_notices(student_id);
CREATE INDEX idx_pickup_persons_school ON pickup_persons(school_id);
CREATE INDEX idx_pickup_person_students_student ON pickup_person_students(student_id);
CREATE INDEX idx_pickup_person_students_person ON pickup_person_students(pickup_person_id);
CREATE INDEX idx_pickup_requests_school_date ON pickup_requests(school_id, request_date);
CREATE INDEX idx_pickup_requests_student ON pickup_requests(student_id);
CREATE INDEX idx_otp_username ON otp_codes(username, used, expires_at) WHERE username IS NOT NULL;
CREATE INDEX idx_otp_email ON otp_codes(email, used, expires_at) WHERE email IS NOT NULL;
CREATE INDEX idx_school_custom_roles_school ON school_custom_roles(school_id, is_active);
CREATE INDEX idx_school_non_school_days_school_date ON school_non_school_days(school_id, calendar_date);
CREATE INDEX idx_school_non_school_days_batch ON school_non_school_days(school_id, batch_id);
CREATE INDEX idx_gate_day_overrides_school_date ON gate_day_overrides(school_id, override_date);
CREATE INDEX idx_promotions_school_date ON student_class_promotions(school_id, effective_date);
CREATE INDEX idx_gate_activity_school_time ON gate_activity_logs(school_id, created_at DESC);
CREATE INDEX idx_gate_activity_student ON gate_activity_logs(student_id, created_at DESC);
CREATE INDEX idx_auth_security_user_time ON auth_security_events(user_id, created_at DESC);
CREATE INDEX idx_auth_security_identifier_time ON auth_security_events(identifier, created_at DESC);
CREATE INDEX idx_password_resets_identifier ON password_reset_requests(identifier, used, expires_at);
CREATE INDEX idx_audit_logs_school_time ON audit_logs(school_id, created_at DESC);

-- ============ ROW LEVEL SECURITY ============
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_school_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_class_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE gate_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE dismissal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE extra_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE pickup_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE pickup_persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE pickup_person_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE pickup_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_non_school_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_calendar_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE gate_day_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_class_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gate_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;

-- ============ RLS POLICIES ============

-- User profiles
CREATE POLICY "Users read own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- Schools
CREATE POLICY "Users see their schools" ON schools
  FOR SELECT USING (
    id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid())
  );
CREATE POLICY "Admins update schools" ON schools
  FOR UPDATE USING (
    id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin'))
  );

-- School classes
CREATE POLICY "Users see school classes" ON school_classes
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid())
  );
CREATE POLICY "Admins manage classes" ON school_classes
  FOR ALL USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin'))
  );

-- Custom fields
CREATE POLICY "Users see custom fields" ON school_custom_fields
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid())
  );
CREATE POLICY "Admins manage custom fields" ON school_custom_fields
  FOR ALL USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin'))
  );

-- User roles
CREATE POLICY "Users see own roles" ON user_school_roles
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins manage roles" ON user_school_roles
  FOR ALL USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin'))
  );

-- Teacher profiles
CREATE POLICY "Staff see teacher profiles" ON teacher_profiles
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid())
  );
CREATE POLICY "Admins manage teacher profiles" ON teacher_profiles
  FOR ALL USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin'))
  );

-- Teacher class assignments
CREATE POLICY "Staff see teacher assignments" ON teacher_class_assignments
  FOR SELECT USING (
    teacher_profile_id IN (SELECT id FROM teacher_profiles WHERE school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid()))
  );
CREATE POLICY "Admins manage teacher assignments" ON teacher_class_assignments
  FOR ALL USING (
    teacher_profile_id IN (SELECT id FROM teacher_profiles WHERE school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin')))
  );

-- Students (staff only — parents use "Parents see linked students" below)
CREATE POLICY "Staff see students" ON students
  FOR SELECT USING (
    school_id IN (
      SELECT school_id FROM user_school_roles
      WHERE user_id = auth.uid() AND is_active = true
      AND role IN ('school_admin', 'teacher', 'gate_officer', 'staff')
    )
  );
CREATE POLICY "Admins manage students" ON students
  FOR ALL USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin'))
  );

-- Student parents
CREATE POLICY "Parents see own links" ON student_parents
  FOR SELECT USING (parent_user_id = auth.uid());
CREATE POLICY "Admins manage parent links" ON student_parents
  FOR ALL USING (
    student_id IN (
      SELECT id FROM students WHERE school_id IN (
        SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin')
      )
    )
  );

-- Gate sessions
CREATE POLICY "Gate staff manage sessions" ON gate_sessions
  FOR ALL USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('gate_officer', 'school_admin'))
  );

-- Attendance (staff only — parents use "Parents see children attendance" below)
CREATE POLICY "Staff see attendance" ON attendance_records
  FOR SELECT USING (
    school_id IN (
      SELECT school_id FROM user_school_roles
      WHERE user_id = auth.uid() AND is_active = true
      AND role IN ('school_admin', 'teacher', 'gate_officer', 'staff')
    )
  );
CREATE POLICY "Gate officers create attendance" ON attendance_records
  FOR INSERT WITH CHECK (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('gate_officer', 'school_admin', 'teacher'))
  );

-- Staff attendance
CREATE POLICY "Staff see own attendance" ON staff_attendance
  FOR SELECT USING (
    user_id = auth.uid() OR
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin'))
  );
CREATE POLICY "Gate officers log staff attendance" ON staff_attendance
  FOR INSERT WITH CHECK (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('gate_officer', 'school_admin'))
  );

-- Dismissals (staff only)
CREATE POLICY "Staff see dismissals" ON dismissal_requests
  FOR SELECT USING (
    school_id IN (
      SELECT school_id FROM user_school_roles
      WHERE user_id = auth.uid() AND is_active = true
      AND role IN ('school_admin', 'teacher', 'gate_officer', 'staff')
    )
  );
CREATE POLICY "Teachers create dismissals" ON dismissal_requests
  FOR INSERT WITH CHECK (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('teacher', 'school_admin'))
  );
CREATE POLICY "Gate officers update dismissals" ON dismissal_requests
  FOR UPDATE USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('gate_officer', 'school_admin', 'teacher'))
  );

-- Extra lessons
CREATE POLICY "Staff see extra lessons" ON extra_lessons
  FOR SELECT USING (
    school_id IN (
      SELECT school_id FROM user_school_roles
      WHERE user_id = auth.uid() AND is_active = true
      AND role IN ('school_admin', 'teacher', 'gate_officer', 'staff')
    )
  );
CREATE POLICY "Teachers manage extra lessons" ON extra_lessons
  FOR ALL USING (
    school_id IN (
      SELECT school_id FROM user_school_roles
      WHERE user_id = auth.uid() AND is_active = true
      AND role IN ('teacher', 'school_admin')
    )
  );

-- Pickup notices
CREATE POLICY "Parents see own pickup notices" ON pickup_notices
  FOR SELECT USING (parent_user_id = auth.uid());
CREATE POLICY "Parents create pickup notices" ON pickup_notices
  FOR INSERT WITH CHECK (
    parent_user_id = auth.uid() AND
    student_id IN (SELECT student_id FROM student_parents WHERE parent_user_id = auth.uid())
  );
CREATE POLICY "Staff see school pickup notices" ON pickup_notices
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid())
  );

-- Pickup persons
CREATE POLICY "Staff see pickup persons" ON pickup_persons
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid())
  );
CREATE POLICY "Admins and parents create/update pickup persons" ON pickup_persons
  FOR INSERT WITH CHECK (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin', 'parent'))
  );
CREATE POLICY "Admins and parents update pickup persons" ON pickup_persons
  FOR UPDATE USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin', 'parent'))
  );
CREATE POLICY "Only admins delete pickup persons" ON pickup_persons
  FOR DELETE USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin'))
  );

-- Pickup person student links
CREATE POLICY "Staff see pickup person links" ON pickup_person_students
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid())
  );
CREATE POLICY "Admins manage pickup person links" ON pickup_person_students
  FOR INSERT WITH CHECK (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin', 'parent'))
  );
CREATE POLICY "Admins and parents update pickup person links" ON pickup_person_students
  FOR UPDATE USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin', 'parent'))
  );
CREATE POLICY "Only admins delete pickup person links" ON pickup_person_students
  FOR DELETE USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin'))
  );

-- Pickup requests
CREATE POLICY "Staff see pickup requests" ON pickup_requests
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid())
  );
CREATE POLICY "Parents create pickup requests" ON pickup_requests
  FOR INSERT WITH CHECK (
    parent_user_id = auth.uid() AND
    student_id IN (SELECT student_id FROM student_parents WHERE parent_user_id = auth.uid())
  );
CREATE POLICY "Staff update pickup requests" ON pickup_requests
  FOR UPDATE USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin', 'gate_officer'))
  );

-- Notifications
CREATE POLICY "Users see own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

-- Push subscriptions
CREATE POLICY "Users manage own subscriptions" ON push_subscriptions
  FOR ALL USING (user_id = auth.uid());

-- Custom roles
CREATE POLICY "School staff see custom roles" ON school_custom_roles
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND is_active = true)
  );
CREATE POLICY "Admins manage custom roles" ON school_custom_roles
  FOR ALL USING (
    school_id IN (
      SELECT school_id FROM user_school_roles
      WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin') AND is_active = true
    )
  );

-- Non-school days
CREATE POLICY "Staff see non school days" ON school_non_school_days
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid())
  );
CREATE POLICY "Admins manage non school days" ON school_non_school_days
  FOR ALL USING (
    school_id IN (
      SELECT school_id FROM user_school_roles
      WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin')
    )
  );

-- Calendar settings
CREATE POLICY "Staff see calendar settings" ON school_calendar_settings
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid())
  );
CREATE POLICY "Admins manage calendar settings" ON school_calendar_settings
  FOR ALL USING (
    school_id IN (
      SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin')
    )
  );

-- Day overrides
CREATE POLICY "Staff see day overrides" ON gate_day_overrides
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid())
  );
CREATE POLICY "Admins and HR override non school days" ON gate_day_overrides
  FOR ALL USING (
    school_id IN (
      SELECT school_id FROM user_school_roles
      WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin', 'staff')
    )
  );

-- Promotions
CREATE POLICY "Staff see promotions" ON student_class_promotions
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid())
  );
CREATE POLICY "Admins manage promotions" ON student_class_promotions
  FOR ALL USING (
    school_id IN (
      SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin')
    )
  );

-- Gate activities
CREATE POLICY "Staff see gate activity logs" ON gate_activity_logs
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM user_school_roles WHERE user_id = auth.uid())
  );
CREATE POLICY "Gate staff write gate activity logs" ON gate_activity_logs
  FOR INSERT WITH CHECK (
    school_id IN (
      SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('gate_officer', 'school_admin')
    )
  );

-- Auth security events (own rows only)
CREATE POLICY "Users see own auth events" ON auth_security_events
  FOR SELECT USING (user_id = auth.uid());

-- Password reset requests
CREATE POLICY "Users see own password resets" ON password_reset_requests
  FOR SELECT USING (user_id = auth.uid());

-- Audit logs
CREATE POLICY "School admins see audit logs" ON audit_logs
  FOR SELECT USING (
    school_id IN (
      SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin')
    )
  );
CREATE POLICY "School staff write audit logs" ON audit_logs
  FOR INSERT WITH CHECK (
    school_id IN (
      SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin', 'gate_officer', 'teacher', 'staff')
    )
  );

-- Parents (linked children only — defense in depth for direct Supabase client use)
CREATE POLICY "Parents see linked students" ON students
  FOR SELECT USING (
    id IN (SELECT student_id FROM student_parents WHERE parent_user_id = auth.uid())
  );
CREATE POLICY "Parents see children attendance" ON attendance_records
  FOR SELECT USING (
    student_id IN (SELECT student_id FROM student_parents WHERE parent_user_id = auth.uid())
  );
CREATE POLICY "Parents see school calendar days" ON school_non_school_days
  FOR SELECT USING (
    school_id IN (
      SELECT school_id FROM user_school_roles WHERE user_id = auth.uid() AND role = 'parent'
    )
  );

-- ============ REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_records;
ALTER PUBLICATION supabase_realtime ADD TABLE dismissal_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE extra_lessons;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE pickup_requests;

-- ============ TRIGGERS ============
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_schools_updated_at BEFORE UPDATE ON schools FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_teacher_profiles_updated_at BEFORE UPDATE ON teacher_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_school_classes_updated_at BEFORE UPDATE ON school_classes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_school_calendar_settings_updated_at BEFORE UPDATE ON school_calendar_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============ COLUMN DOCUMENTATION ============
COMMENT ON TABLE user_profiles IS 'App users. Login is username + password. email is optional contact for notifications only.';
COMMENT ON COLUMN user_profiles.username IS 'Unique login username (3–32 chars: a-z, 0-9, dot, underscore). Required.';
COMMENT ON COLUMN user_profiles.email IS 'Optional contact email for notifications — NOT used for login.';
COMMENT ON COLUMN user_profiles.auth_preference IS 'Always password. OTP/email login removed.';
COMMENT ON TABLE otp_codes IS 'Legacy — OTP login disabled. App uses username + password only.';
COMMENT ON COLUMN schools.logo_url IS 'Storage path in photos bucket: logos/{school_id}.jpg';
COMMENT ON COLUMN schools.principal_signature_url IS 'Storage path in photos bucket: signatures/{school_id}.jpg';
COMMENT ON COLUMN schools.approval_status IS 'pending = awaiting super-admin; approved = active; rejected = denied';
COMMENT ON COLUMN schools.welcome_message IS 'Shown on school-branded login page when ?school_id= is set';
COMMENT ON COLUMN school_classes.section IS 'Class arm/stream (e.g. A, B). Uniqueness is (school_id, name, section).';
COMMENT ON COLUMN students.photo_url IS 'Storage path under photos bucket (e.g. students/{school_id}/{id}.jpg) or legacy public URL';
COMMENT ON COLUMN teacher_profiles.photo_url IS 'Storage path under photos bucket or legacy public URL';
COMMENT ON COLUMN attendance_records.minutes_late IS 'Minutes late for late arrivals (NULL if on_time or absent)';
COMMENT ON COLUMN dismissal_requests.dismissal_date IS 'Calendar date of dismissal — used to prevent double-tap per student per day';
COMMENT ON TABLE extra_lessons IS 'Students staying for extra lesson — not ready for pickup until teacher releases them';
COMMENT ON TABLE pickup_persons IS 'Authorised persons who can collect a student — with photo for gate verification';
COMMENT ON TABLE pickup_requests IS 'Parent sends a message to school about who will pick up their child today';
COMMENT ON TABLE school_custom_roles IS 'Display job titles for staff role users; can_assign_class allows homeroom class link';
COMMENT ON TABLE school_non_school_days IS 'Holidays, closures, events — excluded from absent counts in reports';

-- ============ PLATFORM SCHOOL (super_admin roles only) ============
INSERT INTO schools (id, name, setup_completed, setup_step, approval_status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'MyEduRide Platform',
  TRUE,
  'complete',
  'approved'
)
ON CONFLICT (id) DO NOTHING;

-- ============ STORAGE: PHOTOS BUCKET ============
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photos',
  'photos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

DROP POLICY IF EXISTS "Service role photos all" ON storage.objects;
CREATE POLICY "Service role photos all"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'photos')
  WITH CHECK (bucket_id = 'photos');

-- ============ END OF SCHEMA ============
-- Fresh database setup complete. supabase/migrations/ is not used — this file is authoritative.
