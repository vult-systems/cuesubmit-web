import { getDb } from './index';

// ─── Enums ────────────────────────────────────────────

export const DEPARTMENTS = [
  'lookdev', 'blocking', 'spline', 'polish', 'lighting', 'rendering', 'comp',
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const STATUSES = [
  'not-started', 'in-progress', 'review', 'approved', 'omit',
] as const;
export type Status = (typeof STATUSES)[number];

export const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Priority = (typeof PRIORITIES)[number];

// ─── Validation ───────────────────────────────────────

const ACT_CODE_RE = /^act\d{2}$/;
const SHOT_CODE_RE = /^shot\d{2}$/;

export function isValidActCode(code: string): boolean {
  return ACT_CODE_RE.test(code);
}

export function isValidShotCode(code: string): boolean {
  return SHOT_CODE_RE.test(code);
}

export function isValidDepartment(d: string): d is Department {
  return (DEPARTMENTS as readonly string[]).includes(d);
}

export function isValidStatus(s: string): s is Status {
  return (STATUSES as readonly string[]).includes(s);
}

export function isValidPriority(p: string): p is Priority {
  return (PRIORITIES as readonly string[]).includes(p);
}

// ─── Types ────────────────────────────────────────────

export interface Act {
  id: number;
  code: string;
  name: string;
  sort_order: number;
}

export interface Shot {
  id: number;
  act_id: number;
  code: string;
  frame_start: number;
  frame_end: number;
  thumbnail: string | null;
  priority: Priority;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShotWithAct extends Shot {
  act_code: string;
  act_name: string;
  combined_code: string;
  departments: ShotStatus[];
}

export interface ShotStatus {
  id: number;
  shot_id: number;
  department: Department;
  status: Status;
  assignee: string | null;
  updated_at: string;
}

export interface StatusLogEntry {
  id: number;
  shot_id: number;
  department: Department;
  previous_status: Status;
  new_status: Status;
  changed_by: string;
  changed_at: string;
}

// ─── Table Initialization ─────────────────────────────

export function initializeProductionTables(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS prod_acts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS prod_shots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      act_id INTEGER NOT NULL REFERENCES prod_acts(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      frame_start INTEGER NOT NULL DEFAULT 1001,
      frame_end INTEGER NOT NULL DEFAULT 1120,
      thumbnail TEXT,
      priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(act_id, code)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS prod_shot_statuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shot_id INTEGER NOT NULL REFERENCES prod_shots(id) ON DELETE CASCADE,
      department TEXT NOT NULL CHECK (department IN ('lookdev', 'blocking', 'spline', 'polish', 'lighting', 'rendering', 'comp')),
      status TEXT NOT NULL DEFAULT 'not-started' CHECK (status IN ('not-started', 'in-progress', 'review', 'approved', 'omit')),
      assignee TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(shot_id, department)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS prod_status_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shot_id INTEGER NOT NULL REFERENCES prod_shots(id) ON DELETE CASCADE,
      department TEXT NOT NULL,
      previous_status TEXT NOT NULL,
      new_status TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prod_shots_act ON prod_shots(act_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prod_shot_statuses_shot ON prod_shot_statuses(shot_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prod_status_log_shot ON prod_status_log(shot_id);`);
}

// ─── Acts CRUD ────────────────────────────────────────

export function getAllActs(): Act[] {
  const db = getDb();
  return db.prepare('SELECT * FROM prod_acts ORDER BY sort_order, code').all() as Act[];
}

export function getActById(id: number): Act | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM prod_acts WHERE id = ?').get(id) as Act | undefined;
}

export function createAct(code: string, name: string, sortOrder?: number): Act {
  const db = getDb();
  const order = sortOrder ?? (db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM prod_acts').get() as { next: number }).next;
  const result = db.prepare('INSERT INTO prod_acts (code, name, sort_order) VALUES (?, ?, ?)').run(code, name, order);
  return getActById(Number(result.lastInsertRowid))!;
}

export function updateAct(id: number, updates: { code?: string; name?: string; sort_order?: number }): Act | undefined {
  const db = getDb();
  const sets: string[] = [];
  const values: (string | number)[] = [];
  if (updates.code !== undefined) { sets.push('code = ?'); values.push(updates.code); }
  if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name); }
  if (updates.sort_order !== undefined) { sets.push('sort_order = ?'); values.push(updates.sort_order); }
  if (sets.length === 0) return getActById(id);
  values.push(id);
  db.prepare(`UPDATE prod_acts SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getActById(id);
}

export function deleteAct(id: number): { shotsDeleted: number } {
  const db = getDb();
  const shotCount = (db.prepare('SELECT COUNT(*) as cnt FROM prod_shots WHERE act_id = ?').get(id) as { cnt: number }).cnt;
  db.prepare('DELETE FROM prod_acts WHERE id = ?').run(id);
  return { shotsDeleted: shotCount };
}

export function getActShotCount(id: number): number {
  const db = getDb();
  return (db.prepare('SELECT COUNT(*) as cnt FROM prod_shots WHERE act_id = ?').get(id) as { cnt: number }).cnt;
}

// ─── Shots CRUD ───────────────────────────────────────

export function getAllShots(filters?: {
  act_id?: number;
  priority?: Priority;
  department?: Department;
  status?: Status;
  search?: string;
}): ShotWithAct[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters?.act_id) {
    conditions.push('s.act_id = ?');
    params.push(filters.act_id);
  }
  if (filters?.priority) {
    conditions.push('s.priority = ?');
    params.push(filters.priority);
  }
  if (filters?.search) {
    // Search against the combined act_code + '_' + shot_code
    conditions.push("(a.code || '_' || s.code) LIKE ?");
    params.push(`%${filters.search}%`);
  }

  let sql = `
    SELECT s.*, a.code AS act_code, a.name AS act_name
    FROM prod_shots s
    JOIN prod_acts a ON s.act_id = a.id
  `;
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY a.sort_order, a.code, s.code';

  const shots = db.prepare(sql).all(...params) as (Shot & { act_code: string; act_name: string })[];

  // Batch-load department statuses
  if (shots.length === 0) return [];

  const shotIds = shots.map(s => s.id);
  const placeholders = shotIds.map(() => '?').join(',');
  const allStatuses = db.prepare(
    `SELECT * FROM prod_shot_statuses WHERE shot_id IN (${placeholders}) ORDER BY shot_id`
  ).all(...shotIds) as ShotStatus[];

  const statusesByShot = new Map<number, ShotStatus[]>();
  for (const st of allStatuses) {
    const arr = statusesByShot.get(st.shot_id) || [];
    arr.push(st);
    statusesByShot.set(st.shot_id, arr);
  }

  // Post-filter by department/status if needed
  let result: ShotWithAct[] = shots.map(s => ({
    ...s,
    combined_code: `${s.act_code}_${s.code}`,
    departments: statusesByShot.get(s.id) || [],
  }));

  if (filters?.department) {
    result = result.filter(s =>
      s.departments.some(d => d.department === filters.department)
    );
  }
  if (filters?.status) {
    result = result.filter(s =>
      s.departments.some(d => d.department === filters?.department && d.status === filters.status) ||
      (!filters.department && s.departments.some(d => d.status === filters!.status))
    );
  }

  return result;
}

export function getShotById(id: number): ShotWithAct | undefined {
  const db = getDb();
  const shot = db.prepare(`
    SELECT s.*, a.code AS act_code, a.name AS act_name
    FROM prod_shots s
    JOIN prod_acts a ON s.act_id = a.id
    WHERE s.id = ?
  `).get(id) as (Shot & { act_code: string; act_name: string }) | undefined;

  if (!shot) return undefined;

  const departments = db.prepare(
    'SELECT * FROM prod_shot_statuses WHERE shot_id = ? ORDER BY department'
  ).all(id) as ShotStatus[];

  return {
    ...shot,
    combined_code: `${shot.act_code}_${shot.code}`,
    departments,
  };
}

export function createShot(data: {
  act_id: number;
  code: string;
  frame_start?: number;
  frame_end?: number;
  priority?: Priority;
  notes?: string | null;
}): ShotWithAct {
  const db = getDb();
  const now = new Date().toISOString();

  const result = db.prepare(`
    INSERT INTO prod_shots (act_id, code, frame_start, frame_end, priority, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.act_id,
    data.code,
    data.frame_start ?? 1001,
    data.frame_end ?? 1120,
    data.priority ?? 'medium',
    data.notes ?? null,
    now,
    now,
  );

  const shotId = Number(result.lastInsertRowid);

  // Initialize all department statuses
  const insertStatus = db.prepare(
    'INSERT INTO prod_shot_statuses (shot_id, department, status, updated_at) VALUES (?, ?, ?, ?)'
  );
  for (const dept of DEPARTMENTS) {
    insertStatus.run(shotId, dept, 'not-started', now);
  }

  return getShotById(shotId)!;
}

export function updateShot(id: number, updates: {
  code?: string;
  act_id?: number;
  frame_start?: number;
  frame_end?: number;
  thumbnail?: string | null;
  priority?: Priority;
  notes?: string | null;
}): ShotWithAct | undefined {
  const db = getDb();
  const sets: string[] = ['updated_at = ?'];
  const values: (string | number | null)[] = [new Date().toISOString()];

  if (updates.code !== undefined) { sets.push('code = ?'); values.push(updates.code); }
  if (updates.act_id !== undefined) { sets.push('act_id = ?'); values.push(updates.act_id); }
  if (updates.frame_start !== undefined) { sets.push('frame_start = ?'); values.push(updates.frame_start); }
  if (updates.frame_end !== undefined) { sets.push('frame_end = ?'); values.push(updates.frame_end); }
  if (updates.thumbnail !== undefined) { sets.push('thumbnail = ?'); values.push(updates.thumbnail); }
  if (updates.priority !== undefined) { sets.push('priority = ?'); values.push(updates.priority); }
  if (updates.notes !== undefined) { sets.push('notes = ?'); values.push(updates.notes); }

  values.push(id);
  db.prepare(`UPDATE prod_shots SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getShotById(id);
}

export function deleteShot(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM prod_shots WHERE id = ?').run(id);
}

// ─── Department Status ────────────────────────────────

export function updateDepartmentStatus(
  shotId: number,
  department: Department,
  newStatus: Status,
  changedBy: string,
  assignee?: string | null,
): ShotStatus {
  const db = getDb();
  const now = new Date().toISOString();

  // Get current status for logging
  const current = db.prepare(
    'SELECT * FROM prod_shot_statuses WHERE shot_id = ? AND department = ?'
  ).get(shotId, department) as ShotStatus | undefined;

  const previousStatus = current?.status ?? 'not-started';

  // Upsert status
  db.prepare(`
    INSERT INTO prod_shot_statuses (shot_id, department, status, assignee, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(shot_id, department) DO UPDATE SET
      status = excluded.status,
      assignee = COALESCE(excluded.assignee, prod_shot_statuses.assignee),
      updated_at = excluded.updated_at
  `).run(shotId, department, newStatus, assignee ?? current?.assignee ?? null, now);

  // Log the change
  if (previousStatus !== newStatus) {
    db.prepare(`
      INSERT INTO prod_status_log (shot_id, department, previous_status, new_status, changed_by, changed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(shotId, department, previousStatus, newStatus, changedBy, now);
  }

  return db.prepare(
    'SELECT * FROM prod_shot_statuses WHERE shot_id = ? AND department = ?'
  ).get(shotId, department) as ShotStatus;
}

export function bulkUpdateStatus(
  shotIds: number[],
  department: Department,
  newStatus: Status,
  changedBy: string,
): void {
  const db = getDb();
  const updateOne = db.transaction((shotId: number) => {
    updateDepartmentStatus(shotId, department, newStatus, changedBy);
  });
  for (const id of shotIds) {
    updateOne(id);
  }
}

// ─── Stats ────────────────────────────────────────────

export interface ActStats {
  act_id: number;
  act_code: string;
  act_name: string;
  total_shots: number;
  department_completion: Record<Department, { total: number; completed: number; pct: number }>;
  overall_pct: number;
}

export function getActStats(): ActStats[] {
  const db = getDb();
  const acts = getAllActs();
  const result: ActStats[] = [];

  for (const act of acts) {
    const shots = db.prepare('SELECT id FROM prod_shots WHERE act_id = ?').all(act.id) as { id: number }[];
    const shotIds = shots.map(s => s.id);

    const deptCompletion: Record<string, { total: number; completed: number; pct: number }> = {};
    for (const dept of DEPARTMENTS) {
      deptCompletion[dept] = { total: 0, completed: 0, pct: 0 };
    }

    if (shotIds.length > 0) {
      const placeholders = shotIds.map(() => '?').join(',');
      const statuses = db.prepare(
        `SELECT department, status FROM prod_shot_statuses WHERE shot_id IN (${placeholders})`
      ).all(...shotIds) as { department: Department; status: Status }[];

      for (const s of statuses) {
        const d = deptCompletion[s.department];
        if (d) {
          d.total++;
          if (s.status === 'approved') {
            d.completed++;
          }
        }
      }
      for (const dept of DEPARTMENTS) {
        const d = deptCompletion[dept];
        d.pct = d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0;
      }
    }

    const totalDeptEntries = Object.values(deptCompletion).reduce((s, d) => s + d.total, 0);
    const totalCompleted = Object.values(deptCompletion).reduce((s, d) => s + d.completed, 0);
    const overallPct = totalDeptEntries > 0 ? Math.round((totalCompleted / totalDeptEntries) * 100) : 0;

    result.push({
      act_id: act.id,
      act_code: act.code,
      act_name: act.name,
      total_shots: shotIds.length,
      department_completion: deptCompletion as Record<Department, { total: number; completed: number; pct: number }>,
      overall_pct: overallPct,
    });
  }

  return result;
}
