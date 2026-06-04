import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Manual staff attendance is disabled — use ID card scan only.
 * Gate manager: Gate app. School admin: Staff attendance page scan panel.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        'Manual staff marking is not allowed. Scan the staff ID card at the gate or on Staff attendance.',
    },
    { status: 403 }
  );
}
