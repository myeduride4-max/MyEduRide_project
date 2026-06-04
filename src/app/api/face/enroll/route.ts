import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { photos } = await request.json();

    if (!photos || photos.length < 3) {
      return NextResponse.json(
        { error: 'Minimum 3 photos required for enrollment' },
        { status: 400 }
      );
    }

    // Face enrollment is done client-side using face-api.js
    // This endpoint processes the captured photos and returns the average descriptor
    // In production, this would run face-api.js server-side or use a dedicated ML service

    // For now, we return a placeholder that signals the client to process locally
    return NextResponse.json({
      message: 'Process face enrollment client-side',
      processLocally: true,
    });
  } catch (error) {
    console.error('Face enrollment error:', error);
    return NextResponse.json({ error: 'Enrollment failed' }, { status: 500 });
  }
}


