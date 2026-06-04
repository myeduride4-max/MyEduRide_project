export const MIN_PASSWORD_LENGTH = 6;

export function validatePasswordLength(password: string): string | null {
  const p = password.trim();
  if (!p) return 'Password is required';
  if (p.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

export function validatePasswordPair(
  password: string,
  confirmPassword: string
): string | null {
  const lengthErr = validatePasswordLength(password);
  if (lengthErr) return lengthErr;
  if (password.trim() !== confirmPassword.trim()) {
    return 'Password and confirmation do not match';
  }
  return null;
}

export function resolveInitialPassword(
  provided: string | undefined | null,
  fallback?: string
): string {
  const trimmed = (provided || '').trim();
  if (trimmed.length >= MIN_PASSWORD_LENGTH) return trimmed;
  const fb = (fallback || '').trim();
  if (fb.length >= MIN_PASSWORD_LENGTH) return fb;
  return '';
}
