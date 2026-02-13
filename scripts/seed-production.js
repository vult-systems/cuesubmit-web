#!/usr/bin/env node
/**
 * Idempotent seed script for production tracking dev data.
 * Populates prod_acts, prod_shots, and prod_shot_statuses with
 * realistic Nightlight Guardians test data.
 *
 * Safe to run multiple times — skips if any acts already exist.
 *
 * Usage:
 *   node scripts/seed-production.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'cuesubmit.db');

console.log(`Opening database: ${DB_PATH}`);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Check if already seeded
const existing = db.prepare('SELECT COUNT(*) as cnt FROM prod_acts').get();
if (existing.cnt > 0) {
  console.log(`Database already has ${existing.cnt} act(s). Skipping seed.`);
  db.close();
  process.exit(0);
}

const DEPARTMENTS = ['lookdev', 'blocking', 'spline', 'polish', 'lighting', 'rendering', 'comp'];

const ACTS = [
  { code: 'act01', name: 'The Awakening', sort_order: 1 },
  { code: 'act02', name: 'Into the Dark', sort_order: 2 },
  { code: 'act03', name: 'Dawn of Light', sort_order: 3 },
];

const SHOTS_PER_ACT = [
  // Act 1 — 6 shots, mostly complete
  [
    { code: 'shot01', fs: 1001, fe: 1048, priority: 'medium', notes: 'Establishing shot — bedroom at night' },
    { code: 'shot02', fs: 1001, fe: 1096, priority: 'medium', notes: 'Close-up: nightlight flickers on' },
    { code: 'shot03', fs: 1001, fe: 1072, priority: 'high', notes: 'Hero reveal — guardian emerges from light' },
    { code: 'shot04', fs: 1001, fe: 1120, priority: 'medium', notes: 'Wide: bedroom transforms' },
    { code: 'shot05', fs: 1001, fe: 1060, priority: 'low', notes: 'Transition to shadow realm' },
    { code: 'shot06', fs: 1001, fe: 1036, priority: 'medium', notes: 'Guardian looks back at sleeping child' },
  ],
  // Act 2 — 8 shots, mid-progress
  [
    { code: 'shot01', fs: 1001, fe: 1144, priority: 'high', notes: 'Guardian enters shadow forest' },
    { code: 'shot02', fs: 1001, fe: 1072, priority: 'medium', notes: 'Shadow creatures stir' },
    { code: 'shot03', fs: 1001, fe: 1096, priority: 'critical', notes: 'Key action beat — first encounter' },
    { code: 'shot04', fs: 1001, fe: 1060, priority: 'medium', notes: 'Guardian discovers power' },
    { code: 'shot05', fs: 1001, fe: 1120, priority: 'medium', notes: 'Forest maze sequence' },
    { code: 'shot06', fs: 1001, fe: 1048, priority: 'low', notes: 'Campfire rest scene' },
    { code: 'shot07', fs: 1001, fe: 1084, priority: 'high', notes: 'Shadow ambush' },
    { code: 'shot08', fs: 1001, fe: 1036, priority: 'medium', notes: 'Escape and regroup' },
  ],
  // Act 3 — 5 shots, early progress
  [
    { code: 'shot01', fs: 1001, fe: 1096, priority: 'medium', notes: 'Dawn breaks over the shadow realm' },
    { code: 'shot02', fs: 1001, fe: 1120, priority: 'high', notes: 'Final confrontation' },
    { code: 'shot03', fs: 1001, fe: 1072, priority: 'critical', notes: 'Guardian unleashes full power' },
    { code: 'shot04', fs: 1001, fe: 1060, priority: 'medium', notes: 'Nightlight dims — guardian sleeps' },
    { code: 'shot05', fs: 1001, fe: 1048, priority: 'medium', notes: 'Final frame — child wakes, smiles' },
  ],
];

// Weighted status picker: earlier acts skew toward completion
function pickStatus(actIndex, deptIndex) {
  // Completion probability decreases with act and dept pipeline stage
  const actWeight = 1 - (actIndex / 3); // act01=0.67, act03=0.0
  const deptWeight = 1 - (deptIndex / 7); // earlier depts more complete
  const combined = actWeight * 0.7 + deptWeight * 0.3;
  const r = Math.random();

  if (combined > 0.7) {
    // Mostly done
    if (r < 0.6) return 'approved';
    if (r < 0.85) return 'review';
    return 'in-progress';
  } else if (combined > 0.4) {
    // Mid-progress
    if (r < 0.25) return 'approved';
    if (r < 0.5) return 'review';
    if (r < 0.75) return 'in-progress';
    return 'not-started';
  } else if (combined > 0.15) {
    // Early
    if (r < 0.1) return 'approved';
    if (r < 0.25) return 'review';
    if (r < 0.5) return 'in-progress';
    return 'not-started';
  } else {
    // Barely started
    if (r < 0.15) return 'in-progress';
    return 'not-started';
  }
}

const ARTIST_NAMES = [
  'alex.chen', 'maya.rodriguez', 'jordan.kim', 'sam.patel',
  'chris.nguyen', 'taylor.johnson', 'casey.lee', 'morgan.davis',
  'riley.martinez', 'drew.wilson',
];

function pickArtist() {
  return ARTIST_NAMES[Math.floor(Math.random() * ARTIST_NAMES.length)];
}

// ─── Seed ─────────────────────────────────────────────

console.log('Seeding NLG production data...\n');

const insertAct = db.prepare('INSERT INTO prod_acts (code, name, sort_order) VALUES (?, ?, ?)');
const insertShot = db.prepare(
  `INSERT INTO prod_shots (act_id, code, frame_start, frame_end, priority, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
);
const insertStatus = db.prepare(
  `INSERT INTO prod_shot_statuses (shot_id, department, status, assignee, updated_at) VALUES (?, ?, ?, ?, datetime('now'))`
);

const seedAll = db.transaction(() => {
  for (let ai = 0; ai < ACTS.length; ai++) {
    const act = ACTS[ai];
    const actResult = insertAct.run(act.code, act.name, act.sort_order);
    const actId = actResult.lastInsertRowid;
    console.log(`  ${act.code}: ${act.name} (${SHOTS_PER_ACT[ai].length} shots)`);

    for (const shotDef of SHOTS_PER_ACT[ai]) {
      const shotResult = insertShot.run(
        actId, shotDef.code, shotDef.fs, shotDef.fe, shotDef.priority, shotDef.notes
      );
      const shotId = shotResult.lastInsertRowid;

      for (let di = 0; di < DEPARTMENTS.length; di++) {
        insertStatus.run(shotId, DEPARTMENTS[di], 'not-started', null);
      }
    }
  }
});

seedAll();

const totalShots = db.prepare('SELECT COUNT(*) as cnt FROM prod_shots').get();
const totalStatuses = db.prepare('SELECT COUNT(*) as cnt FROM prod_shot_statuses').get();

console.log(`\n✓ Seeded ${ACTS.length} acts, ${totalShots.cnt} shots, ${totalStatuses.cnt} department statuses`);
db.close();
console.log('Done.');
