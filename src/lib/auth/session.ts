import { getIronSession, IronSession } from 'iron-session';
import { cookies } from 'next/headers';

export interface SessionData {
  userId: string;
  username: string;
  role: 'admin' | 'manager' | 'student';
  fullName: string | null;
  isLoggedIn: boolean;
}

const sessionOptions = {
  password: process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long',
  cookieName: 'cuesubmit_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
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
