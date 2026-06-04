// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchData } from '@/lib/api';
import { CheckCircle, Circle, School as SchoolIcon, ArrowRight, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DynamicFieldInput } from '@/components/shared/DynamicFieldInput';

type SetupStep = 'classes' | 'fields' | 'complete';

export default function SchoolSetupPage() {
  const [schoolId, setSchoolId] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [currentStep, setCurrentStep] = useState<SetupStep>('classes');
  const [loading, setLoading] = useState(true);

  // Classes state
  const [classes, setClasses] = useState([{ name: '', grade: '' }]);

  // Fields state
  const [studentFields, setStudentFields] = useState([
    { field_label: 'Date of Birth', field_type: 'date', is_required: false },
    { field_label: 'Gender', field_type: 'select', is_required: true, options: ['Male', 'Female'] },
    { field_label: 'Parent Email', field_type: 'email', is_required: true },
    { field_label: 'Parent Name', field_type: 'text', is_required: true },
    { field_label: 'Parent Phone', field_type: 'phone', is_required: false },
  ]);

  const router = useRouter();

  useEffect(() => { loadSchool(); }, []);

  const loadSchool = async () => {
    try {
      const data = await fetchData('get_school_admin_data', { role: 'school_admin' });
      if (data.school) {
        setSchoolId(data.school_id);
        setSchoolName(data.school.name);
        if (data.school.setup_completed) {
          router.push('/dashboard/school-admin');
          return;
        }
      }
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const handleSaveClasses = async () => {
    const valid = classes.filter(c => c.name.trim());
    if (valid.length === 0) { toast.error('Add at least one class'); return; }

    const res = await fetch('/api/setup/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, classes: valid }),
    });

    if (res.ok) {
      toast.success(`${valid.length} classes saved`);
      setCurrentStep('fields');
    } else {
      toast.error('Failed to save classes');
    }
  };

  const handleSaveFields = async () => {
    const valid = studentFields.filter(f => f.field_label.trim());

    const res = await fetch('/api/setup/fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, fields: valid }),
    });

    if (res.ok) {
      toast.success('Fields saved');
      setCurrentStep('complete');
      // Mark setup as complete
      await fetch('/api/setup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId }),
      });
      router.push('/dashboard/school-admin');
    } else {
      toast.error('Failed to save fields');
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-primary-600">Loading setup...</div></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
            <SchoolIcon size={20} className="text-primary-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Set Up {schoolName}</h1>
            <p className="text-sm text-gray-500">Configure your school</p>
          </div>
        </div>

        {/* Steps */}
        <div className="flex items-center gap-4 mb-8">
          <div className={`flex items-center gap-2 ${currentStep === 'classes' ? 'text-primary-600' : 'text-green-600'}`}>
            {currentStep === 'classes' ? <Circle size={18} /> : <CheckCircle size={18} />}
            <span className="text-sm font-medium">Classes</span>
          </div>
          <div className="flex-1 h-0.5 bg-gray-200" />
          <div className={`flex items-center gap-2 ${currentStep === 'fields' ? 'text-primary-600' : 'text-gray-400'}`}>
            <Circle size={18} />
            <span className="text-sm font-medium">Fields</span>
          </div>
        </div>

        {/* Step 1: Classes */}
        {currentStep === 'classes' && (
          <div className="card">
            <h2 className="text-lg font-bold mb-2">Define Your Classes</h2>
            <p className="text-sm text-gray-500 mb-4">Add all classes in your school. Students will be assigned to these.</p>

            <div className="space-y-2">
              {classes.map((cls, idx) => (
                <div key={idx} className="flex gap-3 items-center">
                  <input
                    type="text" value={cls.name} placeholder="Class name (e.g. JSS 1A)"
                    onChange={(e) => setClasses(prev => prev.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))}
                    className="input flex-1"
                  />
                  <input
                    type="text" value={cls.grade} placeholder="Grade (e.g. Grade 7)"
                    onChange={(e) => setClasses(prev => prev.map((c, i) => i === idx ? { ...c, grade: e.target.value } : c))}
                    className="input w-40"
                  />
                  {classes.length > 1 && (
                    <button onClick={() => setClasses(prev => prev.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-500">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button onClick={() => setClasses(prev => [...prev, { name: '', grade: '' }])} className="mt-3 flex items-center gap-1 text-sm text-primary-600 font-medium">
              <Plus size={14} /> Add Class
            </button>

            <div className="mt-6 flex justify-end">
              <button onClick={handleSaveClasses} className="btn-primary flex items-center gap-2">
                Save & Continue <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Fields */}
        {currentStep === 'fields' && (
          <div className="card">
            <h2 className="text-lg font-bold mb-2">Student Data Fields</h2>
            <p className="text-sm text-gray-500 mb-4">What info do you want to collect when adding students? You can modify these later.</p>

            <div className="space-y-3">
              {studentFields.map((field, idx) => (
                <div key={idx} className="flex gap-3 items-center p-3 bg-gray-50 rounded-lg">
                  <input
                    type="text" value={field.field_label} placeholder="Field name"
                    onChange={(e) => setStudentFields(prev => prev.map((f, i) => i === idx ? { ...f, field_label: e.target.value } : f))}
                    className="input flex-1"
                  />
                  <select
                    value={field.field_type}
                    onChange={(e) => setStudentFields(prev => prev.map((f, i) => i === idx ? { ...f, field_type: e.target.value } : f))}
                    className="input w-32"
                  >
                    <option value="text">Text</option>
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                    <option value="date">Date</option>
                    <option value="number">Number</option>
                    <option value="select">Dropdown</option>
                  </select>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={field.is_required} onChange={(e) => setStudentFields(prev => prev.map((f, i) => i === idx ? { ...f, is_required: e.target.checked } : f))} />
                    Required
                  </label>
                  <button onClick={() => setStudentFields(prev => prev.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-500">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <button onClick={() => setStudentFields(prev => [...prev, { field_label: '', field_type: 'text', is_required: false }])} className="mt-3 flex items-center gap-1 text-sm text-primary-600 font-medium">
              <Plus size={14} /> Add Field
            </button>

            <div className="mt-6 flex justify-end">
              <button onClick={handleSaveFields} className="btn-primary flex items-center gap-2">
                Complete Setup <CheckCircle size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
