import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { SessionData, sessionOptions } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  try {
    const response = NextResponse.json({ isLoggedIn: false });
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json(
        { isLoggedIn: false },
        { status: 200 }
      );
    }

    return NextResponse.json({
      isLoggedIn: true,
      user: {
        id: session.userId,
        username: session.username,
        role: session.role,
        fullName: session.fullName,
      },
    });
  } catch (error) {
    console.error('Session error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
