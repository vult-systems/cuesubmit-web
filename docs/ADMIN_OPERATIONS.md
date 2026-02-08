# Admin Operations

Quick-reference for CueSubmit Web + OpenCue administration.

---

## Infrastructure

| What | Value |
|------|-------|
| Production server | `REDACTED_IP` |
| SSH | `ssh REDACTED_USER@REDACTED_IP` |
| CueSubmit Web | `http://REDACTED_IP:3000` |
| REST Gateway | `http://REDACTED_IP:8448` (JWT auth) |
| Cuebot gRPC | `REDACTED_IP:8443` |
| PostgreSQL | `127.0.0.1:5432` — user: `cuebot`, pass: `REDACTED_PASSWORD`, db: `cuebot_local` |
| SQLite (users/hosts) | `/app/data/cuesubmit.db` (Docker), `data/cuesubmit.db` (local) |
| JWT secret | `REDACTED_SECRET` |
| Session secret | `REDACTED_SECRET` |
| Docker container | `cuesubmit-web`, network_mode: host |
| Render logs volume | `/angd_server_pool/renderRepo` → `/mnt/RenderOutputRepo:ro` |
| Log path in OpenCue DB | `//REDACTED_IP/RenderOutputRepo/OpenCue/Logs/...` |
| Windows UNC access | `\\REDACTED_IP\RenderOutputRepo\OpenCue\Logs\...` |

---

## Deploy

```bash
ssh REDACTED_USER@REDACTED_IP "cd /home/perforce/cuesubmit-web && git pull && docker compose build --no-cache && docker compose up -d"
```

Verify:
```bash
ssh REDACTED_USER@REDACTED_IP "docker ps --filter name=cuesubmit-web --format '{{.Status}}'"
```

View logs:
```bash
ssh REDACTED_USER@REDACTED_IP "docker logs cuesubmit-web --tail 30"
```

---

## Environment Variables

### Production (docker-compose.yml)
```
CUEWEB_MODE=online
CUEWEB_API_BASE=http://127.0.0.1:8448
REST_GATEWAY_URL=http://127.0.0.1:8448
JWT_SECRET=REDACTED_SECRET
SESSION_SECRET=REDACTED_SECRET
DATABASE_PATH=/app/data/cuesubmit.db
RENDER_REPO_PATH=/mnt/RenderOutputRepo
ADMIN_INITIAL_PASSWORD=REDACTED_PASSWORD
```

### Local Dev (.env.local — gitignored)
```
CUEWEB_MODE=online
CUEWEB_API_BASE=http://REDACTED_IP:8448
REST_GATEWAY_URL=http://REDACTED_IP:8448
JWT_SECRET=REDACTED_SECRET
SESSION_SECRET=REDACTED_SECRET
ADMIN_INITIAL_PASSWORD=REDACTED_PASSWORD
```

Local dev doesn't set `RENDER_REPO_PATH` — defaults to `\\REDACTED_IP\RenderOutputRepo` (Windows UNC).

---

## PostgreSQL

Connect:
```bash
ssh REDACTED_USER@REDACTED_IP
PGPASSWORD=REDACTED_PASSWORD psql -U cuebot -h 127.0.0.1 -d cuebot_local
```

### Key Tables

| Table | FK Dependencies (must delete first) |
|-------|-------------------------------------|
| `show` | ← `subscription`, `folder` |
| `folder` | ← `job` |
| `job` | ← `frame`, `layer`, `job_history` |
| `host` | (no FK deps) |

### Delete a Show

```sql
-- Find the show
SELECT pk_show, str_name FROM show;

-- Find jobs under it
SELECT pk_job, str_name, str_state FROM job
WHERE pk_folder IN (SELECT pk_folder FROM folder WHERE pk_show = '<SHOW_PK>');

-- Delete in order: frames → layers → job_history → jobs → subscriptions → show
BEGIN;
DELETE FROM frame WHERE pk_job IN (SELECT pk_job FROM job WHERE pk_folder IN (SELECT pk_folder FROM folder WHERE pk_show = '<SHOW_PK>'));
DELETE FROM layer WHERE pk_job IN (SELECT pk_job FROM job WHERE pk_folder IN (SELECT pk_folder FROM folder WHERE pk_show = '<SHOW_PK>'));
DELETE FROM job_history WHERE pk_job IN (SELECT pk_job FROM job WHERE pk_folder IN (SELECT pk_folder FROM folder WHERE pk_show = '<SHOW_PK>'));
DELETE FROM job WHERE pk_folder IN (SELECT pk_folder FROM folder WHERE pk_show = '<SHOW_PK>');
DELETE FROM subscription WHERE pk_show = '<SHOW_PK>';
DELETE FROM folder WHERE pk_show = '<SHOW_PK>';
DELETE FROM show WHERE pk_show = '<SHOW_PK>';
COMMIT;
```

### Delete a Host (via DB)

```sql
DELETE FROM host WHERE pk_host = '<HOST_UUID>';
```

Or use the UI trash icon (calls `host.HostInterface/Delete` on the gateway).

---

## Gateway API (curl)

Generate JWT inside the container:
```bash
docker exec cuesubmit-web node -e "
  const crypto=require('crypto');
  const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const p=Buffer.from(JSON.stringify({sub:'admin',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
  const sig=crypto.createHmac('sha256','REDACTED_SECRET').update(h+'.'+p).digest('base64url');
  console.log(h+'.'+p+'.'+sig);
"
```

List shows:
```bash
curl -s -X POST http://127.0.0.1:8448/show.ShowInterface/GetShows \
  -H "Content-Type: application/json" -H "Authorization: Bearer <JWT>" -d '{}'
```

List hosts:
```bash
curl -s -X POST http://127.0.0.1:8448/host.HostInterface/GetHosts \
  -H "Content-Type: application/json" -H "Authorization: Bearer <JWT>" -d '{"r":{}}'
```

Delete host:
```bash
curl -s -X POST http://127.0.0.1:8448/host.HostInterface/Delete \
  -H "Content-Type: application/json" -H "Authorization: Bearer <JWT>" \
  -d '{"host":{"id":"<HOST_UUID>"}}'
```

---

## Log Path Conversion

OpenCue stores log paths as `//REDACTED_IP/RenderOutputRepo/OpenCue/Logs/...`

The logs API route (`src/app/api/jobs/[id]/logs/route.ts`) converts them:

| Environment | Source prefix | Replaced with |
|-------------|--------------|---------------|
| Docker | `//REDACTED_IP/RenderOutputRepo` | `/mnt/RenderOutputRepo` |
| Docker | `/angd_server_pool/renderRepo` | `/mnt/RenderOutputRepo` |
| Windows dev | `//REDACTED_IP/RenderOutputRepo` | `\\REDACTED_IP\RenderOutputRepo` |

Log files are named: `<jobname>.<NNNN>-<layername>.rqlog` (e.g. `jobname.0030-arnold.rqlog`)

To check if logs are accessible from inside Docker:
```bash
docker exec cuesubmit-web ls /mnt/RenderOutputRepo/OpenCue/Logs/
```

---

## SQLite (Host Metadata / Users)

Sync from production to local dev:
```bash
# Stop dev server first (or DB will be locked)
npm run sync-db
```

Query locally:
```bash
node -e "const db=require('better-sqlite3')('./data/cuesubmit.db'); console.log(db.prepare('SELECT * FROM host_metadata').all());"
```

---

## Gotchas

1. **`.gitignore` has `/logs/`** — Only matches root-level `logs/` dir. If you ever create an API route with `logs` in the path, verify it's tracked: `git ls-files <path>` and `git check-ignore -v <path>`.

2. **`npm run sync-db` fails with EBUSY** — Stop the dev server first. The SQLite file is locked while Next.js is running.

3. **Active hosts re-register** — Deleting a host from OpenCue only works for decommissioned machines. If RQD is still running, the host will reappear.

4. **Gateway returns HTML on 404** — If an API route file isn't deployed, Next.js returns an HTML 404 page. The frontend can't parse it as JSON, giving `Unexpected token '<'`. Fix: make sure the route file is committed (`git ls-files`) and rebuild.

5. **FK constraint errors on show delete** — Must delete in order: frames → layers → job_history → jobs → subscriptions → folders → show. See the SQL above.

6. **Local dev points to production gateway** — `.env.local` uses `REDACTED_IP:8448`. You're hitting the real OpenCue. Be careful with destructive operations.

7. **Docker volume is read-only** — The render repo mount is `:ro`. Logs can only be read, not written/deleted from the web container.

8. **Cuebot kill requires a `reason` field** — `JobKillRequest` has `username`, `pid`, `host_kill`, and `reason` fields. If `reason` is empty, cuebot silently ignores the kill (logs "Invalid Job Kill Request" but returns 200). Always send a non-empty `reason`. Same applies to `KillFrames`. See `JobManagerSupport.shutdownJob()` in cuebot source.
