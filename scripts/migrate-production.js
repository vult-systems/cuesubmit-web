#!/usr/bin/env node
/**
 * Idempotent migration script for production tracking tables.
 * Creates prod_acts, prod_shots, prod_shot_statuses, and prod_status_log
 * tables if they don't already exist. Safe to run multiple times.
 *
 * Usage:
 *   node scripts/migrate-production.js
 *
 * Respects DATABASE_PATH env var. Falls back to data/cuesubmit.db.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'cuesubmit.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Ensure thumbnails directory exists
const thumbnailDir = path.join(dataDir, 'thumbnails');
if (!fs.existsSync(thumbnailDir)) {
  fs.mkdirSync(thumbnailDir, { recursive: true });
  console.log(`Created thumbnails directory: ${thumbnailDir}`);
}

console.log(`Opening database: ${DB_PATH}`);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ─── Create tables ────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS prod_acts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
`);
console.log('✓ prod_acts');

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
console.log('✓ prod_shots');

db.exec(`
  CREATE TABLE IF NOT EXISTS prod_shot_statuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shot_id INTEGER NOT NULL REFERENCES prod_shots(id) ON DELETE CASCADE,
    department TEXT NOT NULL CHECK (department IN ('modeling', 'rigging', 'texturing', 'animation', 'lighting', 'rendering', 'comp')),
    status TEXT NOT NULL DEFAULT 'not-started' CHECK (status IN ('not-started', 'in-progress', 'review', 'approved', 'omit')),
    assignee TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(shot_id, department)
  );
`);
console.log('✓ prod_shot_statuses');

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
console.log('✓ prod_status_log');

// ─── Create indexes ───────────────────────────────────

db.exec(`CREATE INDEX IF NOT EXISTS idx_prod_shots_act ON prod_shots(act_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_prod_shot_statuses_shot ON prod_shot_statuses(shot_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_prod_status_log_shot ON prod_status_log(shot_id);`);
console.log('✓ indexes');

db.close();
console.log('\nProduction tracking migration complete.');
