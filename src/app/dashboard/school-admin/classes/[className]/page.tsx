'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Student } from '@/lib/types';
import { Users, GraduationCap, ArrowLeft, UserPlus } from 'lucide-react';
import Link from 'next/link';
import StudentAvatar from '@/components/shared/StudentAvatar';

export default function ClassDetailPage() {
  const params = useParams();
  const className = decodeURIComponent(params.className as string);
  const [students, setStudents] = useState<Student[]>([]);
  const [teacherName, setTeacherName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchClassData();
  }, [className]);

  const fetchClassData = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: role } = await supabase
      .from('user_school_roles')
      .select('school_id')
      .eq('user_id', user.id)
      .eq('role', 'school_admin')
      .single();

    if (!role) return;

    // Get students in this class
    const { data: classStudents } = await supabase
      .from('students')
      .select('*')
      .eq('school_id', role.school_id)
      .eq('class_name', className)
      .eq('is_active', true)
      .order('last_name');

    if (classStudents) setStudents(classStudents);

    // Get assigned teacher
    const { data: teacherClass } = await supabase
      .from('teacher_classes')
      .select('teacher:user_profiles!teacher_user_id(full_name)')
      .eq('school_id', role.school_id)
      .eq('class_name', className)
      .single();

    if (teacherClass) {
      setTeacherName((teacherClass as any).teacher?.full_name || null);
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-primary-600">Loading class...</div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <Link href="/dashboard/school-admin/classes" className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-3">
          <ArrowLeft size={16} />
          Back to Classes
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{className}</h1>
            <div className="flex items-center gap-4 mt-1">
              <span className="flex items-center gap-1.5 text-sm text-gray-500">
                <Users size={14} />
                {students.length} students
              </span>
              {teacherName && (
                <span className="flex items-center gap-1.5 text-sm text-gray-500">
                  <GraduationCap size={14} />
                  {teacherName}
                </span>
              )}
            </div>
          </div>
          <Link href="/dashboard/school-admin/students/new" className="btn-primary flex items-center gap-2 text-sm">
            <UserPlus size={16} />
            Add Student
          </Link>
        </div>
      </div>

      {/* Students grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {students.map(student => (
          <div key={student.id} className="card flex items-center gap-3 py-4">
            <StudentAvatar
              photoUrl={student.photo_url}
              firstName={student.first_name}
              lastName={student.last_name}
              size="sm"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{student.first_name} {student.last_name}</p>
              <p className="text-xs text-gray-400">{student.student_id_number}</p>
            </div>
            {student.face_descriptor ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700">Face OK</span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700">No Face</span>
            )}
          </div>
        ))}
      </div>

      {students.length === 0 && (
        <div className="card text-center py-12">
          <Users size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No students in this class yet</p>
        </div>
      )}
    </div>
  );
}
