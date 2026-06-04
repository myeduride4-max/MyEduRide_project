/**
 * Client-side data fetching helper.
 * All dashboard pages use this instead of direct Supabase client.
 * Routes through /api/data which uses service role key.
 */

export async function fetchData(action: string, params?: any) {
  const res = await fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, params }),
    cache: 'no-store',
    credentials: 'include',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }

  return res.json();
}

/**
 * Get current user session from cookie
 */
export function getSession() {
  if (typeof document === 'undefined') return null;
  
  const cookieStr = document.cookie
    .split('; ')
    .find(c => c.startsWith('myeduride_session='));

  if (!cookieStr) return null;

  try {
    return JSON.parse(decodeURIComponent(cookieStr.split('=').slice(1).join('=')));
  } catch {
    return null;
  }
}

/**
 * Check if user is logged in
 */
export function isAuthenticated(): boolean {
  return getSession() !== null;
}

/**
 * Persist session cookie (client-readable) and notify listeners.
 */
export function saveSession(session: Record<string, unknown>) {
  if (typeof document === 'undefined') return;
  const maxAge = 60 * 60 * 24 * 7;
  document.cookie = `myeduride_session=${encodeURIComponent(JSON.stringify(session))}; path=/; max-age=${maxAge}`;
  window.dispatchEvent(new CustomEvent('myeduride:session-updated', { detail: session }));
}

/**
 * Logout - clear session cookie
 */
export function logout() {
  document.cookie = 'myeduride_session=; path=/; max-age=0';
  window.location.href = '/auth/login';
}
