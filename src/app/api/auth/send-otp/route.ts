import { NextRequest, NextResponse } from 'next/server';

/** Legacy OTP route — login is username + password only. */
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { error: 'OTP login is disabled. Sign in with your username and password.' },
    { status: 410 }
  );
}
