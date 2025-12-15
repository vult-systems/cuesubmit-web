import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { SessionData, sessionOptions } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  try {
    const response = NextResponse.json({ success: true });
    const session = await getIronSession<SessionData>(request, response, sessionOptions);
    session.destroy();
    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
