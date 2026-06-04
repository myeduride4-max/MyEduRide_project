import { NextRequest } from 'next/server';

export type AppSession = {
  user_id: string;
  username: string;
  email: string;
  full_name: string;
  roles: { role: string; school_id: string }[];
};

export function parseSessionCookie(cookieValue?: string): AppSession | null {
  if (!cookieValue) return null;
  try {
    let decoded = cookieValue;
    for (let i = 0; i < 3; i++) {
      try {
        const parsed = JSON.parse(decoded);
        if (parsed?.user_id) return parsed as AppSession;
      } catch {
        decoded = decodeURIComponent(decoded);
      }
    }
    const parsed = JSON.parse(decodeURIComponent(decodeURIComponent(cookieValue)));
    if (parsed?.user_id) return parsed as AppSession;
  } catch {
    return null;
  }
  return null;
}

export function getSessionFromRequest(request: NextRequest): AppSession | null {
  return parseSessionCookie(request.cookies.get('myeduride_session')?.value);
}

export function hasRole(session: AppSession, role: string, schoolId?: string): boolean {
  return session.roles.some(
    (r) => r.role === role && (!schoolId || r.school_id === schoolId)
  );
}

// roles from DB may not include is_active on session object
export function sessionHasRole(session: AppSession, role: string): boolean {
  return session.roles.some((r) => r.role === role);
}
