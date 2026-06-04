/** Platform school used only to attach super_admin roles (not a real school). */
export const DEFAULT_PLATFORM_SCHOOL_ID = '00000000-0000-0000-0000-000000000001';

export function getPlatformSchoolId(): string {
  return process.env.PLATFORM_SCHOOL_ID?.trim() || DEFAULT_PLATFORM_SCHOOL_ID;
}

/** Comma-separated list in SUPER_ADMIN_USERNAMES */
export function getSuperAdminUsernames(): string[] {
  const raw = process.env.SUPER_ADMIN_USERNAMES || '';
  return raw
    .split(',')
    .map((u) => u.toLowerCase().trim())
    .filter(Boolean);
}

export function isSuperAdminUsername(username: string): boolean {
  const normalized = username.toLowerCase().trim();
  return getSuperAdminUsernames().includes(normalized);
}
