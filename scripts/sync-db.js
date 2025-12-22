#!/usr/bin/env node
/**
 * Sync the local SQLite database from production
 * 
 * Usage: npm run sync-db
 * 
 * This copies the database files from the production Docker container
 * and checkpoints the WAL to consolidate all data.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROD_HOST = 'perforce@10.40.14.25';
const CONTAINER = 'cuesubmit-web';
const REMOTE_PATH = '/app/data';
const LOCAL_DATA_DIR = path.join(__dirname, '..', 'data');

console.log('🔄 Syncing database from production...\n');

// Ensure data directory exists
if (!fs.existsSync(LOCAL_DATA_DIR)) {
  fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
}

// Backup current local database
const localDb = path.join(LOCAL_DATA_DIR, 'cuesubmit.db');
const backupDb = path.join(LOCAL_DATA_DIR, 'cuesubmit.db.backup');
if (fs.existsSync(localDb)) {
  console.log('📦 Backing up local database...');
  fs.copyFileSync(localDb, backupDb);
}

try {
  // Copy all database files from production
  const files = ['cuesubmit.db', 'cuesubmit.db-wal', 'cuesubmit.db-shm'];
  
  for (const file of files) {
    console.log(`📥 Downloading ${file}...`);
    const localPath = path.join(LOCAL_DATA_DIR, file);
    
    try {
      // Use docker exec + cat to get the file contents
      const cmd = `ssh ${PROD_HOST} "docker exec ${CONTAINER} cat ${REMOTE_PATH}/${file}"`;
      const data = execSync(cmd, { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 });
      fs.writeFileSync(localPath, data);
      console.log(`   ✅ ${file} (${data.length} bytes)`);
    } catch (err) {
      // WAL/SHM files might not exist if DB was just checkpointed
      if (file !== 'cuesubmit.db') {
        console.log(`   ⚠️  ${file} not found (this is okay)`);
        // Remove local WAL/SHM if they don't exist on prod
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
        }
      } else {
        throw err;
      }
    }
  }

  // Checkpoint the WAL to consolidate data
  console.log('\n🔧 Checkpointing WAL...');
  const Database = require('better-sqlite3');
  const db = new Database(localDb);
  db.pragma('wal_checkpoint(TRUNCATE)');
  
  // Get stats
  const hostCount = db.prepare('SELECT COUNT(*) as count FROM host_metadata').get();
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  db.close();

  console.log('\n✅ Database synced successfully!');
  console.log(`   📊 ${hostCount.count} hosts`);
  console.log(`   👤 ${userCount.count} users`);
  
  // Show final file size
  const stats = fs.statSync(localDb);
  console.log(`   💾 ${(stats.size / 1024).toFixed(1)} KB`);

} catch (error) {
  console.error('\n❌ Sync failed:', error.message);
  
  // Restore backup on failure
  if (fs.existsSync(backupDb)) {
    console.log('🔙 Restoring backup...');
    fs.copyFileSync(backupDb, localDb);
  }
  
  process.exit(1);
}
