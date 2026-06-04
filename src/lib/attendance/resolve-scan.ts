/** Normalize QR / ID scan input (MYEDURIDE:STAFF:STF-xxx → multiple lookup keys). */
export function scanLookupValues(raw: string): string[] {
  const trimmed = (raw || '').trim();
  if (!trimmed) return [];

  const values = new Set<string>([trimmed]);
  const upper = trimmed.toUpperCase();

  if (upper.startsWith('MYEDURIDE:')) {
    const rest = trimmed.slice('MYEDURIDE:'.length).trim();
    values.add(rest);
    if (rest.includes(':')) {
      const afterPrefix = rest.slice(rest.indexOf(':') + 1).trim();
      if (afterPrefix) values.add(afterPrefix);
    }
  }

  return [...values];
}
