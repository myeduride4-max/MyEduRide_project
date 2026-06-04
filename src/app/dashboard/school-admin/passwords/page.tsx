'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  RefreshCcw,
  Search,
  BookUser,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CredentialPasswordRows,
  CredentialPasswordTableHead,
  type CredentialUser,
} from '@/components/shared/CredentialPasswordRows';
import {
  StudentParentCredentialRows,
  StudentParentCredentialTableHead,
  type StudentParentCredential,
} from '@/components/shared/StudentParentCredentialRows';

type SchoolBlock = {
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

function formatRole(role: string) {
  return role.replace(/_/g, ' ');
}

type AccountTab = 'student-parents' | 'staff';

function AccountTabBar({
  active,
  onChange,
  staffCount,
  studentCount,
}: {
  active: AccountTab;
  onChange: (tab: AccountTab) => void;
  staffCount: number;
  studentCount: number;
}) {
  const tabs: { id: AccountTab; label: string; count: number }[] = [
    { id: 'student-parents', label: 'Student–parent login', count: studentCount },
    { id: 'staff', label: 'Staff', count: staffCount },
  ];

  return (
    <div className="pill-tabs mb-4">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={active === tab.id ? 'pill-tab-active' : 'pill-tab-inactive'}
        >
          {tab.label}
          <span className="ml-1.5 text-[10px] opacity-80">({tab.count})</span>
        </button>
      ))}
    </div>
  );
}

function SchoolAccountPanels({
  school,
  activeTab,
  draftPasswords,
  draftConfirmPasswords,
  setDraftPasswords,
  setDraftConfirmPasswords,
  onSave,
  onSaveParent,
  onProvisionParent,
  savingId,
  provisioningId,
  showPasswords,
}: {
  school: SchoolBlock;
  activeTab: AccountTab;
  draftPasswords: Record<string, string>;
  draftConfirmPasswords: Record<string, string>;
  setDraftPasswords: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setDraftConfirmPasswords: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSave: (userId: string) => void;
  onSaveParent: (parentUserId: string) => void;
  onProvisionParent: (studentId: string, password: string, confirmPassword: string) => Promise<void>;
  savingId: string | null;
  provisioningId: string | null;
  showPasswords: boolean;
}) {
  if (activeTab === 'student-parents') {
    if (school.students.length === 0) {
      return (
        <div className="px-5 py-8 text-center text-sm text-gray-400">No students yet</div>
      );
    }
    return (
      <StudentSection
        students={school.students}
        draftPasswords={draftPasswords}
        draftConfirmPasswords={draftConfirmPasswords}
        setDraftPasswords={setDraftPasswords}
        setDraftConfirmPasswords={setDraftConfirmPasswords}
        onSave={onSaveParent}
        onProvision={onProvisionParent}
        savingId={savingId}
        provisioningId={provisioningId}
        showPasswords={showPasswords}
      />
    );
  }

  if (school.staff.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-sm text-gray-400">No staff accounts yet</div>
    );
  }

  return (
    <UserSection
      title="Staff accounts"
      icon={<GraduationCap size={14} className="text-blue-600" />}
      users={school.staff}
      draftPasswords={draftPasswords}
      draftConfirmPasswords={draftConfirmPasswords}
      setDraftPasswords={setDraftPasswords}
      setDraftConfirmPasswords={setDraftConfirmPasswords}
      onSave={onSave}
      savingId={savingId}
      showPasswords={showPasswords}
    />
  );
}

function StudentSection({
  students,
  draftPasswords,
  draftConfirmPasswords,
  setDraftPasswords,
  setDraftConfirmPasswords,
  onSave,
  onProvision,
  savingId,
  provisioningId,
  showPasswords,
}: {
  students: StudentParentCredential[];
  draftPasswords: Record<string, string>;
  draftConfirmPasswords: Record<string, string>;
  setDraftPasswords: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setDraftConfirmPasswords: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSave: (parentUserId: string) => void;
  onProvision?: (studentId: string, password: string, confirmPassword: string) => Promise<void>;
  savingId: string | null;
  provisioningId: string | null;
  showPasswords: boolean;
}) {
  if (students.length === 0) return null;

  return (
    <div className="border-t first:border-t-0">
      <div className="px-5 py-2.5 bg-emerald-50/90 flex items-center gap-2 text-xs font-bold text-emerald-900 uppercase tracking-wide">
        <BookUser size={14} className="text-emerald-700" />
        Students — parent login
        <span className="text-emerald-600/70 font-normal">({students.length})</span>
      </div>
      <p className="px-5 py-2 text-xs text-gray-500 border-b bg-white">
        Each student&apos;s parent app login (username &amp; password set when the student was added)
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <StudentParentCredentialTableHead />
          </thead>
          <StudentParentCredentialRows
            rows={students}
            draftPasswords={draftPasswords}
            draftConfirmPasswords={draftConfirmPasswords}
            setDraftPasswords={setDraftPasswords}
            setDraftConfirmPasswords={setDraftConfirmPasswords}
            onSave={onSave}
            onProvision={onProvision}
            savingId={savingId}
            provisioningId={provisioningId}
            showPasswords={showPasswords}
          />
        </table>
      </div>
    </div>
  );
}

function UserSection({
  title,
  icon,
  users,
  draftPasswords,
  draftConfirmPasswords,
  setDraftPasswords,
  setDraftConfirmPasswords,
  onSave,
  savingId,
  showPasswords,
}: {
  title: string;
  icon: React.ReactNode;
  users: CredentialUser[];
  draftPasswords: Record<string, string>;
  draftConfirmPasswords: Record<string, string>;
  setDraftPasswords: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setDraftConfirmPasswords: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSave: (userId: string) => void;
  savingId: string | null;
  showPasswords: boolean;
}) {
  if (users.length === 0) return null;

  return (
    <div className="border-t first:border-t-0">
      <div className="px-5 py-2.5 bg-gray-50/90 flex items-center gap-2 text-xs font-bold text-gray-700 uppercase tracking-wide">
        {icon}
        {title}
        <span className="text-gray-400 font-normal">({users.length})</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead>
            <CredentialPasswordTableHead />
          </thead>
          <CredentialPasswordRows
            users={users}
            draftPasswords={draftPasswords}
            draftConfirmPasswords={draftConfirmPasswords}
            setDraftPasswords={setDraftPasswords}
            setDraftConfirmPasswords={setDraftConfirmPasswords}
            onSave={onSave}
            savingId={savingId}
            showPasswords={showPasswords}
          />
        </table>
      </div>
    </div>
  );
}

function SchoolPasswordBlock({
  school,
  draftPasswords,
  draftConfirmPasswords,
  setDraftPasswords,
  setDraftConfirmPasswords,
  onSave,
  onSaveParent,
  onProvisionParent,
  savingId,
  provisioningId,
  showPasswords,
  activeTab,
  defaultExpanded,
}: {
  school: SchoolBlock;
  draftPasswords: Record<string, string>;
  draftConfirmPasswords: Record<string, string>;
  setDraftPasswords: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setDraftConfirmPasswords: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSave: (userId: string) => void;
  onSaveParent: (parentUserId: string) => void;
  onProvisionParent: (studentId: string, password: string, confirmPassword: string) => Promise<void>;
  savingId: string | null;
  provisioningId: string | null;
  showPasswords: boolean;
  activeTab: AccountTab;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? true);

  const content = (
    <div>
      {school.total_users === 0 && school.students.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">No users at this school yet</div>
      ) : (
        <SchoolAccountPanels
          school={school}
          activeTab={activeTab}
          draftPasswords={draftPasswords}
          draftConfirmPasswords={draftConfirmPasswords}
          setDraftPasswords={setDraftPasswords}
          setDraftConfirmPasswords={setDraftConfirmPasswords}
          onSave={onSave}
          onSaveParent={onSaveParent}
          onProvisionParent={onProvisionParent}
          savingId={savingId}
          provisioningId={provisioningId}
          showPasswords={showPasswords}
        />
      )}
    </div>
  );

  return (
    <div className="card p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 min-h-[52px]"
      >
        {expanded ? (
          <ChevronDown size={18} className="text-gray-400 shrink-0" />
        ) : (
          <ChevronRight size={18} className="text-gray-400 shrink-0" />
        )}
        <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
          <Building2 size={18} className="text-primary-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900">{school.name}</p>
          {school.address && <p className="text-xs text-gray-500 truncate">{school.address}</p>}
          <p className="text-xs text-gray-400 mt-0.5">
            {school.students.length} students · {school.staff.length} staff
          </p>
        </div>
        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 shrink-0">
          {school.total_users} users
        </span>
      </button>
      {expanded && content}
    </div>
  );
}

export default function SchoolAdminPasswordsPage() {
  const [schools, setSchools] = useState<SchoolBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [draftPasswords, setDraftPasswords] = useState<Record<string, string>>({});
  const [draftConfirmPasswords, setDraftConfirmPasswords] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [provisioningId, setProvisioningId] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState(true);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalStudents, setTotalStudents] = useState(0);
  const [totalStaff, setTotalStaff] = useState(0);
  const [activeTab, setActiveTab] = useState<AccountTab>('student-parents');

  const fetchCredentials = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/school-admin/passwords', {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to load credentials');
        return;
      }

      const loadedSchools: SchoolBlock[] = data.schools || [];
      setSchools(loadedSchools);
      setTotalUsers(data.total_users || 0);
      setTotalStudents(data.total_students || 0);
      setTotalStaff(data.total_staff || 0);

      const passwordMap: Record<string, string> = {};
      const confirmMap: Record<string, string> = {};
      for (const school of loadedSchools) {
        for (const user of school.users) {
          passwordMap[user.id] = user.password || '';
          confirmMap[user.id] = user.password || '';
        }
        for (const row of school.students) {
          if (row.parent_user_id) {
            passwordMap[row.parent_user_id] = row.password || '';
            confirmMap[row.parent_user_id] = row.password || '';
          }
        }
      }
      setDraftPasswords(passwordMap);
      setDraftConfirmPasswords(confirmMap);
    } catch {
      toast.error('Failed to load credentials');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  const filteredSchools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return schools;

    return schools
      .map((school) => {
        const schoolMatch =
          school.name.toLowerCase().includes(q) ||
          (school.address || '').toLowerCase().includes(q);

        const filterList = (list: CredentialUser[]) =>
          list.filter(
            (u) =>
              u.full_name.toLowerCase().includes(q) ||
              u.username.toLowerCase().includes(q) ||
              u.roles.some((r) => formatRole(r).includes(q)) ||
              (u.staff_id_number || '').toLowerCase().includes(q)
          );

        const filterStudents = (list: StudentParentCredential[]) =>
          list.filter(
            (s) =>
              s.student_name.toLowerCase().includes(q) ||
              s.student_id_number.toLowerCase().includes(q) ||
              (s.class_name || '').toLowerCase().includes(q) ||
              s.parent_name.toLowerCase().includes(q) ||
              (s.parent_on_file_name || '').toLowerCase().includes(q) ||
              s.parent_username.toLowerCase().includes(q) ||
              (s.primary_pickup_person || '').toLowerCase().includes(q) ||
              (s.authorised_pickup_persons || []).some(
                (p) =>
                  p.name.toLowerCase().includes(q) ||
                  (p.phone || '').toLowerCase().includes(q)
              )
          );

        const staff = filterList(school.staff);
        const parents = filterList(school.parents);
        const other = filterList(school.other);
        const students = filterStudents(school.students);

        if (schoolMatch) return school;
        if (staff.length + parents.length + other.length + students.length === 0) return null;

        const users = [...staff, ...parents, ...other];
        return {
          ...school,
          staff,
          parents,
          other,
          students,
          users,
          total_users: users.length + students.filter((s) => s.parent_user_id).length,
        };
      })
      .filter(Boolean) as SchoolBlock[];
  }, [schools, searchQuery]);

  const provisionParent = async (
    studentId: string,
    password: string,
    confirmPassword: string
  ) => {
    if (password && password !== confirmPassword) {
      toast.error('Password and confirmation do not match');
      return;
    }
    if (password && !confirmPassword) {
      toast.error('Confirm the password');
      return;
    }

    setProvisioningId(studentId);
    try {
      const res = await fetch('/api/school-admin/students/provision-parent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          student_id: studentId,
          password,
          confirm_password: confirmPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not create parent login');
        return;
      }
      if (data.linked) {
        toast.success(`Linked to existing parent @${data.parent_username}`);
      } else {
        toast.success(`Parent login created — username: ${data.parent_username}`);
      }
      await fetchCredentials();
    } catch {
      toast.error('Could not create parent login');
    } finally {
      setProvisioningId(null);
    }
  };

  const savePassword = async (userId: string) => {
    const password = (draftPasswords[userId] || '').trim();
    const confirmPassword = (draftConfirmPasswords[userId] || password).trim();
    if (!password) {
      toast.error('Enter a new password');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Password and confirmation do not match');
      return;
    }

    setSavingId(userId);
    try {
      const res = await fetch('/api/school-admin/users/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ user_id: userId, password, confirm_password: confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to update password');
        return;
      }

      toast.success('Password updated');
      setDraftConfirmPasswords((prev) => ({ ...prev, [userId]: password }));
      const patch = (u: CredentialUser) => (u.id === userId ? { ...u, password } : u);
      const patchStudent = (s: StudentParentCredential) =>
        s.parent_user_id === userId ? { ...s, password } : s;
      setSchools((prev) =>
        prev.map((s) => ({
          ...s,
          staff: s.staff.map(patch),
          parents: s.parents.map(patch),
          other: s.other.map(patch),
          users: s.users.map(patch),
          students: s.students.map(patchStudent),
        }))
      );
    } catch {
      toast.error('Failed to update password');
    } finally {
      setSavingId(null);
    }
  };

  const staffCount = totalStaff || schools.reduce((n, s) => n + s.staff.length, 0);
  const studentCount = totalStudents || schools.reduce((n, s) => n + s.students.length, 0);
  const singleSchool = filteredSchools.length === 1 ? filteredSchools[0] : null;

  return (
    <div className="p-4 sm:p-6 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <KeyRound size={24} className="text-primary-700" />
            Passwords
          </h1>
          <p className="text-sm text-gray-500">
            Staff and student–parent logins — same layout as attendance reports
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <button
            type="button"
            onClick={() => setShowPasswords((v) => !v)}
            className="btn-secondary flex items-center gap-2 text-sm min-h-[44px]"
          >
            {showPasswords ? <EyeOff size={14} /> : <Eye size={14} />}
            {showPasswords ? 'Hide' : 'Show'}
          </button>
          <button type="button" onClick={fetchCredentials} className="btn-secondary flex items-center gap-2 min-h-[44px]">
            <RefreshCcw size={14} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div className="card py-3">
          <p className="text-2xl font-bold">{studentCount}</p>
          <p className="text-xs text-gray-500">Student–parent logins</p>
        </div>
        <div className="card py-3">
          <p className="text-2xl font-bold">{staffCount}</p>
          <p className="text-xs text-gray-500">Staff</p>
        </div>
        <div className="card py-3">
          <p className="text-2xl font-bold">{totalUsers}</p>
          <p className="text-xs text-gray-500">Total accounts</p>
        </div>
      </div>

      <AccountTabBar
        active={activeTab}
        onChange={setActiveTab}
        staffCount={staffCount}
        studentCount={studentCount}
      />

      <div className="relative mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search students, parents, staff, usernames…"
          className="input pl-9 min-h-[44px] w-full"
        />
      </div>

      {loading ? (
        <div className="card text-center py-10 text-gray-500">Loading passwords…</div>
      ) : filteredSchools.length === 0 ? (
        <div className="card text-center py-10 text-gray-500">No users match your search</div>
      ) : singleSchool ? (
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-4 border-b bg-primary-50/50">
            <p className="font-semibold text-gray-900">{singleSchool.name}</p>
            {singleSchool.address && (
              <p className="text-xs text-gray-500">{singleSchool.address}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              {singleSchool.students.length} students · {singleSchool.staff.length} staff
            </p>
          </div>
          {singleSchool.total_users === 0 && singleSchool.students.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">No users at this school yet</div>
          ) : (
            <SchoolAccountPanels
              school={singleSchool}
              activeTab={activeTab}
              draftPasswords={draftPasswords}
              draftConfirmPasswords={draftConfirmPasswords}
              setDraftPasswords={setDraftPasswords}
              setDraftConfirmPasswords={setDraftConfirmPasswords}
              onSave={savePassword}
              onSaveParent={savePassword}
              onProvisionParent={provisionParent}
              savingId={savingId}
              provisioningId={provisioningId}
              showPasswords={showPasswords}
            />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSchools.map((school) => (
            <SchoolPasswordBlock
              key={school.id}
              school={school}
              activeTab={activeTab}
              draftPasswords={draftPasswords}
              draftConfirmPasswords={draftConfirmPasswords}
              setDraftPasswords={setDraftPasswords}
              setDraftConfirmPasswords={setDraftConfirmPasswords}
              onSave={savePassword}
              onSaveParent={savePassword}
              onProvisionParent={provisionParent}
              savingId={savingId}
              provisioningId={provisioningId}
              showPasswords={showPasswords}
              defaultExpanded
            />
          ))}
        </div>
      )}
    </div>
  );
}
