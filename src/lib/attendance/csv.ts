export type AttendanceCsvRow = {
  timestamp: string;
  student_id_number?: string;
  first_name?: string;
  last_name?: string;
  class_name?: string;
  school_name?: string;
  type: string;
  status?: string | null;
  source?: string;
  verification_method?: string;
};

function escapeCsv(value: string | number | null | undefined): string {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function attendanceRecordsToCsv(rows: AttendanceCsvRow[]): string {
  const headers = [
    'Date',
    'Time',
    'Student ID',
    'First Name',
    'Last Name',
    'Class',
    'School',
    'Type',
    'Status',
    'Source',
    'Verification',
  ];

  const lines = rows.map((r) => {
    const d = new Date(r.timestamp);
    return [
      d.toLocaleDateString(),
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      r.student_id_number,
      r.first_name,
      r.last_name,
      r.class_name,
      r.school_name,
      r.type,
      r.status,
      r.source,
      r.verification_method,
    ]
      .map(escapeCsv)
      .join(',');
  });

  return [headers.join(','), ...lines].join('\n');
}
