#!/usr/bin/env node
/**
 * Migration: rename pipeline departments and reset all statuses to not-started.
 *
 * Old departments: modeling, rigging, texturing, animation, lighting, rendering, comp
 * New departments: lookdev, blocking, spline, polish, lighting, rendering, comp
 *
 * This script:
 *  1. Recreates prod_shot_statuses with new CHECK constraint
 *  2. Maps old department names → new names
 *  3. Resets all statuses to 'not-started'
 *
 * Usage:
 *   node scripts/migrate-departments.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'cuesubmit.db');
console.log(`Opening database: ${DB_PATH}`);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const DEPT_MAP = {
  modeling: 'lookdev',
  rigging: 'blocking',
  texturing: 'spline',
  animation: 'polish',
  lighting: 'lighting',
  rendering: 'rendering',
  comp: 'comp',
};

const NEW_DEPARTMENTS = ['lookdev', 'blocking', 'spline', 'polish', 'lighting', 'rendering', 'comp'];

const migrate = db.transaction(() => {
  // Check if already migrated
  const sample = db.prepare("SELECT department FROM prod_shot_statuses LIMIT 1").get();
  if (sample && NEW_DEPARTMENTS.includes(sample.department)) {
    console.log('Departments already migrated. Resetting statuses to not-started...');
    db.prepare("UPDATE prod_shot_statuses SET status = 'not-started', assignee = NULL, updated_at = datetime('now')").run();
    console.log('✓ All statuses reset to not-started');
    return;
  }

  console.log('Migrating departments...');

  // SQLite doesn't allow ALTER TABLE to modify CHECK constraints,
  // so we recreate the table
  db.exec(`
    CREATE TABLE prod_shot_statuses_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shot_id INTEGER NOT NULL REFERENCES prod_shots(id) ON DELETE CASCADE,
      department TEXT NOT NULL CHECK (department IN ('lookdev', 'blocking', 'spline', 'polish', 'lighting', 'rendering', 'comp')),
      status TEXT NOT NULL DEFAULT 'not-started' CHECK (status IN ('not-started', 'in-progress', 'review', 'approved', 'omit')),
      assignee TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(shot_id, department)
    );
  `);

  // Copy data with department remapping, reset all to not-started
  const oldRows = db.prepare('SELECT * FROM prod_shot_statuses').all();
  const insert = db.prepare(
    "INSERT INTO prod_shot_statuses_new (shot_id, department, status, assignee, updated_at) VALUES (?, ?, 'not-started', NULL, datetime('now'))"
  );

  for (const row of oldRows) {
    const newDept = DEPT_MAP[row.department] || row.department;
    insert.run(row.shot_id, newDept);
  }

  // Swap tables
  db.exec('DROP TABLE prod_shot_statuses;');
  db.exec('ALTER TABLE prod_shot_statuses_new RENAME TO prod_shot_statuses;');
  db.exec('CREATE INDEX IF NOT EXISTS idx_prod_shot_statuses_shot ON prod_shot_statuses(shot_id);');

  console.log(`✓ Migrated ${oldRows.length} status rows`);
  console.log('✓ All statuses reset to not-started');

  // Also update the status log table
  const logCount = db.prepare('SELECT COUNT(*) as cnt FROM prod_status_log').get();
  if (logCount.cnt > 0) {
    for (const [oldDept, newDept] of Object.entries(DEPT_MAP)) {
      if (oldDept !== newDept) {
        db.prepare('UPDATE prod_status_log SET department = ? WHERE department = ?').run(newDept, oldDept);
      }
    }
    console.log(`✓ Updated ${logCount.cnt} log entries`);
  }
});

migrate();
db.close();
console.log('Done.');
