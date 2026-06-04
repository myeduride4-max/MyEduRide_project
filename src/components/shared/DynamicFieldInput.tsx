'use client';

import type { SchoolCustomField } from '@/lib/types';

interface Props {
  field: SchoolCustomField;
  value: any;
  onChange: (value: any) => void;
}

export function DynamicFieldInput({ field, onChange, value }: Props) {
  const label = (
    <label className="block text-xs font-medium text-gray-600 mb-1">
      {field.field_label}
      {field.is_required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );

  switch (field.field_type) {
    case 'text':
    case 'email':
    case 'phone':
      return (
        <div>
          {label}
          <input
            type={field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : 'text'}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="input text-sm"
            placeholder={field.placeholder || ''}
            required={field.is_required}
          />
        </div>
      );

    case 'number':
      return (
        <div>
          {label}
          <input
            type="number"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="input text-sm"
            placeholder={field.placeholder || ''}
            required={field.is_required}
          />
        </div>
      );

    case 'date':
      return (
        <div>
          {label}
          <input
            type="date"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="input text-sm"
            required={field.is_required}
          />
        </div>
      );

    case 'select':
      return (
        <div>
          {label}
          <select
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="input text-sm"
            required={field.is_required}
          >
            <option value="">Select...</option>
            {(field.options || []).map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      );

    case 'textarea':
      return (
        <div>
          {label}
          <textarea
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="input text-sm"
            rows={3}
            placeholder={field.placeholder || ''}
            required={field.is_required}
          />
        </div>
      );

    default:
      return null;
  }
}
