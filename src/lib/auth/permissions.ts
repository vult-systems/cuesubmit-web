export type Role = 'admin' | 'manager' | 'student';

export type Permission =
  | 'submit'
  | 'kill'
  | 'pause'
  | 'retry'
  | 'eat'
  | 'manage_users'
  | 'view_all'
  | 'view_own'
  | 'lock_hosts'
  | 'manage_hosts'
  | 'manage_shows';

export const permissions: Record<Role, Permission[]> = {
  admin: ['submit', 'kill', 'pause', 'retry', 'eat', 'manage_users', 'view_all', 'lock_hosts', 'manage_hosts', 'manage_shows'],
  manager: ['submit', 'kill', 'pause', 'retry', 'eat', 'view_all', 'lock_hosts', 'manage_hosts', 'manage_shows'],
  student: ['submit', 'view_own'],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return permissions[role]?.includes(permission) ?? false;
}

export function canViewJob(role: Role, jobUser: string, currentUser: string): boolean {
  if (hasPermission(role, 'view_all')) {
    return true;
  }
  return jobUser === currentUser;
}

export function canPerformJobAction(
  role: Role,
  action: 'kill' | 'pause' | 'retry' | 'eat',
  jobUser: string,
  currentUser: string
): boolean {
  if (!hasPermission(role, action)) {
    return false;
  }
  // Admin and manager can act on any job
  if (hasPermission(role, 'view_all')) {
    return true;
  }
  // Students can only act on their own jobs
  return jobUser === currentUser;
}
