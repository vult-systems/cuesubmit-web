import { getIronSession, IronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export interface SessionData {
  userId: string;
  username: string;
  role: 'admin' | 'manager' | 'student';
  fullName: string | null;
  isLoggedIn: boolean;
}

// In production, SESSION_SECRET must be set. In development, use a default.
const getSessionPassword = (): string => {
  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }
  if (process.env.NODE_ENV === 'production') {
    console.warn('WARNING: SESSION_SECRET not set in production! Using insecure default.');
  }
  return 'dev_only_complex_password_at_least_32_characters_long';
};

export const sessionOptions = {
  password: getSessionPassword(),
  cookieName: 'cuesubmit_session',
  cookieOptions: {
    // Only use secure cookies when explicitly using HTTPS
    secure: process.env.USE_HTTPS === 'true',
    httpOnly: true,
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7, // 1 week
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function getCurrentUser(): Promise<SessionData | null> {
  try {
    const session = await getSession();
    if (!session.isLoggedIn) {
      return null;
    }
    return {
      userId: session.userId,
      username: session.username,
      role: session.role,
      fullName: session.fullName,
      isLoggedIn: session.isLoggedIn,
    };
  } catch (error) {
    console.error('[Session] getCurrentUser error:', error);
    return null;
  }
}

export async function setSession(user: {
  id: string;
  username: string;
  role: 'admin' | 'manager' | 'student';
  full_name: string | null;
}): Promise<void> {
  const session = await getSession();
  session.userId = user.id;
  session.username = user.username;
  session.role = user.role;
  session.fullName = user.full_name;
  session.isLoggedIn = true;
  await session.save();
}

export async function destroySession(): Promise<void> {
  const session = await getSession();
  session.destroy();
}
