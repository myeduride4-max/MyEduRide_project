/** Postgres TIME → HTML input type="time" value (HH:mm). */
export function timeToInputValue(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  const s = String(value).trim();

  // ISO datetime from some drivers: 1970-01-01T08:15:00 or ...T08:15:00.000Z
  const isoMatch = s.match(/T(\d{1,2}):(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1].padStart(2, '0')}:${isoMatch[2]}`;
  }

  const match = s.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

/** HTML time input → Postgres TIME string (HH:mm:ss). */
export function timeInputToDb(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  const match = s.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}:00`;
}

const TIME_FIELDS = [
  'gate_open_time',
  'school_start_time',
  'late_threshold',
  'gate_close_time',
  'dismissal_start_time',
  'dismissal_end_time',
] as const;

/** Map DB school row → settings form fields. */
export function schoolToSettingsForm(school: Record<string, unknown> | null | undefined) {
  if (!school) {
    return {
      name: '',
      address: '',
      logo_url: '',
      principal_signature_url: '',
      welcome_message: '',
      primary_color: '#1B4D3E',
      secondary_color: '#D4A017',
      gate_open_time: '06:30',
      school_start_time: '08:00',
      late_threshold: '08:15',
      gate_close_time: '09:00',
      dismissal_start_time: '14:00',
      dismissal_end_time: '16:00',
    };
  }
  return {
    name: String(school.name || ''),
    address: String(school.address || ''),
    logo_url: String(school.logo_url || ''),
    principal_signature_url: String(school.principal_signature_url || ''),
    welcome_message: String(school.welcome_message || ''),
    primary_color: String(school.primary_color || '#1B4D3E'),
    secondary_color: String(school.secondary_color || '#D4A017'),
    gate_open_time: timeToInputValue(school.gate_open_time as string) || '06:30',
    school_start_time: timeToInputValue(school.school_start_time as string) || '08:00',
    late_threshold: timeToInputValue(school.late_threshold as string) || '08:15',
    gate_close_time: timeToInputValue(school.gate_close_time as string) || '09:00',
    dismissal_start_time: timeToInputValue(school.dismissal_start_time as string) || '14:00',
    dismissal_end_time: timeToInputValue(school.dismissal_end_time as string) || '16:00',
  };
}

export { TIME_FIELDS };
