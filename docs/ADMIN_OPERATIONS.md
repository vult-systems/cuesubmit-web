# Admin Operations & Database Fixes

Reference guide for administrative database operations on the CueSubmit/OpenCue production server.

## Connection Info

| Service | Host | Port | User | Password | Database |
|---------|------|------|------|----------|----------|
| PostgreSQL (OpenCue) | 127.0.0.1 | 5432 | cuebot | uiw3d | cuebot_local |
| REST Gateway | localhost | 8448 | JWT auth | — | — |
| Cuebot | REDACTED_IP | 8443 | — | — | — |
| CueSubmit Web | REDACTED_IP | 3000 | — | — | SQLite (`data/cuesubmit.db`) |

**SSH access:** `ssh REDACTED_USER@REDACTED_IP`

**PostgreSQL connect:**
```bash
export PGPASSWORD=REDACTED_PASSWORD
psql -U cuebot -h 127.0.0.1 -d cuebot_local
```

**Generate a JWT token (run inside container):**
```bash
docker exec cuesubmit-web node -e "
  const crypto=require('crypto');
  const secret=process.env.JWT_SECRET;
  const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const p=Buffer.from(JSON.stringify({sub:'admin',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)})).toString('base64url');
  const sig=crypto.createHmac('sha256',secret).update(h+'.'+p).digest('base64url');
  console.log(h+'.'+p+'.'+sig);
"
```

---

## Completed Operations

### 2026-02-08: Delete `debug_ad405` Show

**Problem:** Debug show `debug_ad405` was leftover from testing and cluttering the Shows page.

**Show ID:** `c433a5d8-bf92-4c6a-83e5-23bc3358aad6`

**Steps:**

1. Tried deleting via gateway API — failed due to FK constraint on `job` → `folder`
2. Found 1 finished job referencing the show's folder:
   ```sql
   SELECT j.pk_job, j.str_name, j.str_state
   FROM job j
   JOIN folder f ON j.pk_folder = f.pk_folder
   JOIN show s ON f.pk_show = s.pk_show
   WHERE s.str_name = 'debug_ad405';
   ```
   Result: `dffa1ec7-0e61-4362-b396-dbe2c1efb448 | debug_ad405-default-cagarc12_debug_ad405_shaman_turnaround | FINISHED`

3. Deleted the job and its dependencies:
   ```sql
   BEGIN;
   DELETE FROM frame WHERE pk_job = 'dffa1ec7-0e61-4362-b396-dbe2c1efb448';       -- 250 rows
   DELETE FROM layer WHERE pk_job = 'dffa1ec7-0e61-4362-b396-dbe2c1efb448';       -- 1 row
   DELETE FROM job_history WHERE pk_job = 'dffa1ec7-0e61-4362-b396-dbe2c1efb448'; -- 1 row
   DELETE FROM job WHERE pk_job = 'dffa1ec7-0e61-4362-b396-dbe2c1efb448';         -- 1 row
   COMMIT;
   ```

4. Tried gateway delete again — failed due to FK constraint on `subscription` → `show`

5. Deleted subscriptions, folders, and show directly:
   ```sql
   BEGIN;
   DELETE FROM subscription WHERE pk_show = 'c433a5d8-bf92-4c6a-83e5-23bc3358aad6'; -- 1 row
   DELETE FROM folder WHERE pk_show = 'c433a5d8-bf92-4c6a-83e5-23bc3358aad6';       -- 0 rows (already cascaded)
   DELETE FROM show WHERE pk_show = 'c433a5d8-bf92-4c6a-83e5-23bc3358aad6';         -- 1 row
   COMMIT;
   ```

6. Verified only `4450_SrThesisWorkshop_S26` remains.

---

### 2026-02-08: Add Host Deletion Feature

**Problem:** 22 deprecated hosts tagged "NULL" cluttering the Hosts page.

**Changes:**
- Added `deleteHost()` to `src/lib/opencue/gateway-client.ts` — calls `host.HostInterface/Delete`
- Added `"delete"` action to `src/app/api/hosts/[id]/route.ts` — gated by `manage_hosts` permission
- Added trash icon button + confirmation dialog to `src/app/(dashboard)/hosts/page.tsx`

**Gateway call:**
```typescript
await gatewayCall('host.HostInterface', 'Delete', { host: { id: hostId } });
```

**Or via curl:**
```bash
curl -s -X POST http://localhost:8448/host.HostInterface/Delete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT>" \
  -d '{"host":{"id":"<HOST_UUID>"}}'
```

### 2026-02-08: Remove Mock Data from Host APIs

**Problem:** Dev mode was using mock/offline host data instead of real production data.

**Changes:**
- Removed `generateMockHosts()` and offline branching from `src/app/api/hosts/route.ts`
- Removed mock metadata generation from `src/app/api/host-metadata/route.ts`
- Both APIs now always pull from real data sources (gateway + SQLite)

### 2026-02-08: Sync Local SQLite DB

**Command:** `npm run sync-db`

Copies `data/cuesubmit.db` from production Docker container to local. Required when local host metadata is stale.

**Note:** Dev server must be stopped first or the DB file will be locked (EBUSY).

---

## Common Procedures

### Delete a Show (Full Cleanup)

OpenCue won't delete a show if it has jobs, subscriptions, or folders referencing it. Delete in this order:

```sql
-- 1. Find the show
SELECT pk_show, str_name FROM show WHERE str_name = '<SHOW_NAME>';

-- 2. Find and delete all jobs
SELECT pk_job, str_name FROM job
WHERE pk_folder IN (SELECT pk_folder FROM folder WHERE pk_show = '<SHOW_PK>');

-- For each job:
DELETE FROM frame WHERE pk_job = '<JOB_PK>';
DELETE FROM layer WHERE pk_job = '<JOB_PK>';
DELETE FROM job_history WHERE pk_job = '<JOB_PK>';
DELETE FROM job WHERE pk_job = '<JOB_PK>';

-- 3. Delete subscriptions, folders, show
DELETE FROM subscription WHERE pk_show = '<SHOW_PK>';
DELETE FROM folder WHERE pk_show = '<SHOW_PK>';
DELETE FROM show WHERE pk_show = '<SHOW_PK>';
```

### Delete a Host from OpenCue

Via the web UI: Click the trash icon on any host → confirm in dialog.

Via curl:
```bash
curl -s -X POST http://localhost:8448/host.HostInterface/Delete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT>" \
  -d '{"host":{"id":"<HOST_UUID>"}}'
```

**Note:** Active hosts with RQD running will re-register automatically. Only delete deprecated/decommissioned hosts.

### Deploy to Production

```bash
ssh REDACTED_USER@REDACTED_IP "cd /home/perforce/cuesubmit-web && git pull && docker compose build --no-cache && docker compose up -d"
```

### List All Shows

```bash
curl -s -X POST http://localhost:8448/show.ShowInterface/GetShows \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT>" \
  -d '{}'
```

### List All Hosts

```bash
curl -s -X POST http://localhost:8448/host.HostInterface/GetHosts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT>" \
  -d '{"r":{}}'
```

---

## OpenCue Database Schema (Key Tables)

| Table | Purpose | Key FK Constraints |
|-------|---------|-------------------|
| `show` | Shows/projects | — |
| `folder` | Job folders per show | `pk_show` → `show` |
| `job` | Render jobs | `pk_folder` → `folder` |
| `layer` | Layers within a job | `pk_job` → `job` |
| `frame` | Individual frames | `pk_job` → `job`, `pk_layer` → `layer` |
| `job_history` | Completed job records | `pk_job` → `job` |
| `subscription` | Show resource subscriptions | `pk_show` → `show` |
| `host` | Render hosts | — |
| `alloc` | Resource allocations | — |

**Deletion order matters:** frame → layer → job_history → job → subscription → folder → show
