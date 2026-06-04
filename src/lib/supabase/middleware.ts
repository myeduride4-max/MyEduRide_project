import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  // We use custom OTP auth, not Supabase session-based auth
  // Dashboard pages handle their own auth checks
  // Just pass through all requests
  return NextResponse.next();
}
