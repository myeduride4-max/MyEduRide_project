// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { downloadIdCardsPdf } from '@/lib/id-card/download';
import StudentAvatar from '@/components/shared/StudentAvatar';
import { Search, Download, CheckSquare, Square, Users, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';

const STAFF_ACCESS_ROLES = ['staff', 'teacher', 'gate_officer', 'school_admin'];

export default function SuperAdminIdCardsPage() {
  const [entityTab, setEntityTab] = useState('students');
  const [students, setStudents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSchool, setSelectedSchool] = useState('all');
  const [selectedRole, setSelectedRole] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
    setSearchQuery('');
  }, [entityTab]);

  const loadData = async () => {
    try {
      const schoolRes = await fetch('/api/schools/list', { cache: 'no-store', credentials: 'include' });
      const schoolData = await schoolRes.json();
      const schoolList = schoolData.schools || [];
      setSchools(schoolList);

      const allStudents = [];
      const allStaff = [];

      for (const school of schoolList) {
        const [studentRes, staffRes] = await Promise.all([
          fetch(`/api/schools/students?school_id=${school.id}`, {
            cache: 'no-store',
            credentials: 'include',
          }),
          fetch(`/api/schools/staff?school_id=${school.id}&ensure_profiles=1`, {
            cache: 'no-store',
            credentials: 'include',
          }),
        ]);

        const studentData = await studentRes.json();
        (studentData.students || []).forEach((s) =>
          allStudents.push({ ...s, school, school_id: school.id })
        );

        const staffData = await staffRes.json();
        (staffData.staff || [])
          .filter((s) => STAFF_ACCESS_ROLES.includes(s.role))
          .forEach((s) => allStaff.push({ ...s, school, school_id: school.id }));
      }

      setStudents(allStudents);
      setStaff(allStaff);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load ID card data');
    }
    setLoading(false);
  };

  const filteredStudents = students.filter((s) => {
    const q = searchQuery.toLowerCase();
    const matchSearch = `${s.first_name} ${s.last_name} ${s.student_id_number}`.toLowerCase().includes(q);
    const matchSchool = selectedSchool === 'all' || s.school_id === selectedSchool;
    return matchSearch && matchSchool;
  });

  const filteredStaff = staff.filter((s) => {
    const q = searchQuery.toLowerCase();
    const matchSearch = `${s.profile?.full_name} ${s.staff?.staff_id_number} ${s.role}`.toLowerCase().includes(q);
    const matchSchool = selectedSchool === 'all' || s.school_id === selectedSchool;
    const matchRole = selectedRole === 'all' || s.role === selectedRole;
    return matchSearch && matchSchool && matchRole;
  });

  const filtered = entityTab === 'students' ? filteredStudents : filteredStaff;

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDownload = async () => {
    if (selectedIds.size === 0) {
      toast.error('Select at least one person');
      return;
    }

    const list = entityTab === 'students' ? students : staff;
    const selected = list.filter((x) => selectedIds.has(x.id));
    const schoolId = selected[0]?.school_id || selected[0]?.school?.id;
    if (!schoolId) {
      toast.error('Could not determine school');
      return;
    }

    const sameSchool = selected.every((x) => (x.school_id || x.school?.id) === schoolId);
    if (!sameSchool) {
      toast.error('Select people from one school at a time');
      return;
    }

    setGenerating(true);
    const result = await downloadIdCardsPdf({
      school_id: schoolId,
      student_ids: entityTab === 'students' ? [...selectedIds] : [],
      staff_role_ids: entityTab === 'staff' ? [...selectedIds] : [],
      fileName: `${entityTab}_id_cards.pdf`,
    });

    if (result.ok) toast.success('PDF ready — open it and print at 100% scale');
    else toast.error(result.error);
    setGenerating(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-12">
        <div className="animate-pulse text-primary-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen pt-14">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">ID Cards</h1>
          <p className="text-sm text-gray-500">
            Super admin · {students.length} students · {staff.length} staff · PDF with photo + QR
          </p>
        </div>
        <button
          onClick={handleDownload}
          disabled={selectedIds.size === 0 || generating}
          className="btn-primary flex items-center gap-2"
        >
          <Download size={18} />
          {generating ? 'Generating...' : `Download PDF (${selectedIds.size})`}
        </button>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-4 max-w-md">
        <button
          type="button"
          onClick={() => setEntityTab('students')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${
            entityTab === 'students' ? 'bg-white shadow text-primary-700' : 'text-gray-500'
          }`}
        >
          <Users size={16} /> Students ({students.length})
        </button>
        <button
          type="button"
          onClick={() => setEntityTab('staff')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${
            entityTab === 'staff' ? 'bg-white shadow text-primary-700' : 'text-gray-500'
          }`}
        >
          <GraduationCap size={16} /> Staff ({staff.length})
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={entityTab === 'students' ? 'Search students...' : 'Search staff...'}
            className="input pl-9"
          />
        </div>
        <select value={selectedSchool} onChange={(e) => setSelectedSchool(e.target.value)} className="input w-56">
          <option value="all">All Schools</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {entityTab === 'staff' && (
          <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} className="input w-44">
            <option value="all">All Roles</option>
            <option value="staff">Staff (all roles)</option>
            <option value="teacher">Teachers</option>
            <option value="gate_officer">Gate Officers</option>
            <option value="school_admin">School Admins</option>
          </select>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          if (selectedIds.size === filtered.length) setSelectedIds(new Set());
          else setSelectedIds(new Set(filtered.map((x) => x.id)));
        }}
        className="text-sm text-primary-600 mb-3 flex items-center gap-2"
      >
        {selectedIds.size === filtered.length ? <CheckSquare size={16} /> : <Square size={16} />}
        Select all shown
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {entityTab === 'students' &&
          filteredStudents.map((student) => (
            <div
              key={student.id}
              onClick={() => toggleSelect(student.id)}
              className={`card flex items-center gap-3 py-3 cursor-pointer ${
                selectedIds.has(student.id) ? 'border-primary-500 bg-primary-50' : ''
              }`}
            >
              {selectedIds.has(student.id) ? (
                <CheckSquare size={18} className="text-primary-600 shrink-0" />
              ) : (
                <Square size={18} className="text-gray-300 shrink-0" />
              )}
              <StudentAvatar
                photoUrl={student.photo_url}
                firstName={student.first_name}
                lastName={student.last_name}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {student.first_name} {student.last_name}
                </p>
                <p className="text-xs text-gray-400">{student.school?.name}</p>
                <p className="text-xs font-mono">{student.student_id_number}</p>
              </div>
            </div>
          ))}

        {entityTab === 'staff' &&
          filteredStaff.map((member) => (
            <div
              key={member.id}
              onClick={() => toggleSelect(member.id)}
              className={`card flex items-center gap-3 py-3 cursor-pointer ${
                selectedIds.has(member.id) ? 'border-primary-500 bg-primary-50' : ''
              }`}
            >
              {selectedIds.has(member.id) ? (
                <CheckSquare size={18} className="text-primary-600 shrink-0" />
              ) : (
                <Square size={18} className="text-gray-300 shrink-0" />
              )}
              <StudentAvatar
                photoUrl={member.staff?.photo_url}
                firstName={member.profile?.full_name?.split(' ')[0]}
                lastName={member.profile?.full_name?.split(' ').slice(1).join(' ')}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{member.profile?.full_name}</p>
                <p className="text-xs text-gray-400">
                  {member.school?.name} · {member.job_title || member.role.replace('_', ' ')}
                </p>
                <p className="text-xs font-mono">
                  {member.staff?.staff_id_number || 'ID will be created on download'}
                </p>
              </div>
            </div>
          ))}
      </div>

      {filtered.length === 0 && (
        <div className="card text-center py-8 text-gray-400">
          {entityTab === 'staff' ? 'No staff found for this school' : 'No students found'}
        </div>
      )}
    </div>
  );
}
