import Database from 'better-sqlite3';
import path from 'path';
import bcrypt from 'bcrypt';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'cuesubmit.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initializeDatabase(db);
  }
  return db;
}

function initializeDatabase(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'student')),
      full_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    );
  `);

  // Host metadata table - stores local reference info for OpenCue hosts
  db.exec(`
    CREATE TABLE IF NOT EXISTS host_metadata (
      opencue_host_id TEXT PRIMARY KEY,
      display_id TEXT,
      system_name TEXT,
      notes TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Check if admin user exists, create if not
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    // Generate a random initial password - MUST be changed on first login in production
    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD || 'changeme_' + Math.random().toString(36).slice(2, 10);
    const hash = bcrypt.hashSync(initialPassword, 10);
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, full_name)
      VALUES (?, ?, ?, ?, ?)
    `).run('admin-001', 'admin', hash, 'admin', 'Administrator');
    console.log('Created default admin user (username: admin)');
    console.log('IMPORTANT: Set ADMIN_INITIAL_PASSWORD env var or change password immediately!');
  }
}

export interface User {
  id: string;
  username: string;
  password_hash: string;
  role: 'admin' | 'manager' | 'student';
  full_name: string | null;
  created_at: string;
  last_login: string | null;
}

export function getUserByUsername(username: string): User | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
}

export function getUserById(id: string): User | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
}

export function getAllUsers(): User[] {
  const db = getDb();
  return db.prepare('SELECT id, username, role, full_name, created_at, last_login FROM users').all() as User[];
}

export function createUser(username: string, password: string, role: string, fullName?: string): User {
  const db = getDb();
  const id = `user-${Date.now()}`;
  const hash = bcrypt.hashSync(password, 10);

  db.prepare(`
    INSERT INTO users (id, username, password_hash, role, full_name)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, username, hash, role, fullName || null);

  return getUserById(id)!;
}

export function updateUserLastLogin(id: string): void {
  const db = getDb();
  db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(id);
}

export function verifyPassword(user: User, password: string): boolean {
  return bcrypt.compareSync(password, user.password_hash);
}

export function deleteUser(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

export function updateUser(id: string, updates: { role?: string; full_name?: string }): void {
  const db = getDb();
  const sets: string[] = [];
  const values: (string | null)[] = [];

  if (updates.role) {
    sets.push('role = ?');
    values.push(updates.role);
  }
  if (updates.full_name !== undefined) {
    sets.push('full_name = ?');
    values.push(updates.full_name);
  }

  if (sets.length > 0) {
    values.push(id);
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }
}

export function updateUserPassword(id: string, newPassword: string): void {
  const db = getDb();
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
}

// Host metadata types and functions
export interface HostMetadata {
  opencue_host_id: string;
  display_id: string | null;
  system_name: string | null;
  notes: string | null;
  updated_at: string;
}

export function getHostMetadata(opencueHostId: string): HostMetadata | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM host_metadata WHERE opencue_host_id = ?').get(opencueHostId) as HostMetadata | undefined;
}

export function getAllHostMetadata(): HostMetadata[] {
  const db = getDb();
  return db.prepare('SELECT * FROM host_metadata').all() as HostMetadata[];
}

export function upsertHostMetadata(
  opencueHostId: string,
  updates: { display_id?: string | null; system_name?: string | null; notes?: string | null }
): HostMetadata {
  const db = getDb();

  // Check if record exists
  const existing = getHostMetadata(opencueHostId);

  if (existing) {
    // Update existing record
    const sets: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: (string | null)[] = [];

    if (updates.display_id !== undefined) {
      sets.push('display_id = ?');
      values.push(updates.display_id);
    }
    if (updates.system_name !== undefined) {
      sets.push('system_name = ?');
      values.push(updates.system_name);
    }
    if (updates.notes !== undefined) {
      sets.push('notes = ?');
      values.push(updates.notes);
    }

    values.push(opencueHostId);
    db.prepare(`UPDATE host_metadata SET ${sets.join(', ')} WHERE opencue_host_id = ?`).run(...values);
  } else {
    // Insert new record
    db.prepare(`
      INSERT INTO host_metadata (opencue_host_id, display_id, system_name, notes)
      VALUES (?, ?, ?, ?)
    `).run(
      opencueHostId,
      updates.display_id ?? null,
      updates.system_name ?? null,
      updates.notes ?? null
    );
  }

  return getHostMetadata(opencueHostId)!;
}
