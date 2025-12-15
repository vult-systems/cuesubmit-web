import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { updateUserPassword, getUserById } from '@/lib/db';
import { hasPermission } from '@/lib/auth/permissions';

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(currentUser.role, 'manage_users')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id, newPassword } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Check if user exists
    const user = getUserById(id);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    updateUserPassword(id, newPassword);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
