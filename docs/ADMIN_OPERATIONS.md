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
| Render output volume | `/angd_server_pool/renderRepo` → `/mnt/RenderOutputRepo:ro` |
| Render source volume | `/opt/perforce/deadlineRenderSource` → `/mnt/RenderSourceRepository:ro` |
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
RENDER_SOURCE_PATH=/mnt/RenderSourceRepository
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

## Frame Preview

The job detail drawer includes a right-side preview panel (480px) that shows rendered frame images.

### How It Works

1. When a job is opened, `/api/jobs/[id]/layers` fetches the layer data
2. The layer command is parsed for `-rd "outputDir"` to find the render output directory
3. When a frame is selected, `/api/files/frame-preview?dir=<outputDir>&frame=<number>` is called
4. The API resolves the path (Linux mount in Docker, UNC on Windows), scans for matching frame images
5. Frame number matching: tries 3/4/5-digit padding (e.g., `001`, `0001`, `00001`) with `.N.` or `_N.` patterns
6. Also scans immediate subdirectories (Arnold often outputs to an `images/` subfolder)
7. Returns the image directly as a binary response (blob URL in the browser)

### Supported Formats

Browser-viewable: PNG, JPG, JPEG, GIF, WebP, BMP
Detected but not viewable: EXR, TIFF, HDR, DPX (shows a message instead)

### Troubleshooting

```bash
# Check if render output is accessible in Docker
docker exec cuesubmit-web ls /mnt/RenderOutputRepo/

# Check if render source is accessible
docker exec cuesubmit-web ls /mnt/RenderSourceRepository/

# Test frame preview API (get a JWT first, see Gateway API section)
curl -s "http://127.0.0.1:3000/api/files/frame-preview?dir=//REDACTED_IP/RenderOutputRepo/path/to/output&frame=1" \
  -H "Cookie: session=<session_cookie>"
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

7. **Docker volumes are read-only** — Both render repo mounts are `:ro`. Logs and rendered images can only be read, not written/deleted from the web container.

8. **Cuebot kill requires a `reason` field** — `JobKillRequest` has `username`, `pid`, `host_kill`, and `reason` fields. If `reason` is empty, cuebot silently ignores the kill (logs "Invalid Job Kill Request" but returns 200). Always send a non-empty `reason`. Same applies to `KillFrames`. See `JobManagerSupport.shutdownJob()` in cuebot source.

9. **Frame preview requires `-rd` in render command** — The preview panel parses the layer command for `-rd "path"` to find the output directory. If a job was submitted without `-rd`, the preview will show "No output directory found in layer command." Standard Arnold submit always includes it.

10. **EXR/TIFF renders won't preview** — The frame preview only supports browser-viewable formats (PNG, JPG, GIF, WebP, BMP). EXR/TIFF frames show a message instead. Arnold default output is EXR; set `-of png` or `-of jpg` in the submit form's Output Format field for browser-previewable output.

11. **Shows MUST be created through the API, not SQL** — Cuebot caches shows in memory. Direct SQL `INSERT INTO show` creates a row the database can see but cuebot (and therefore the gateway, the web UI, and all gRPC clients) cannot. Even restarting cuebot won't reliably pick up a show that was inserted without the full gRPC initialization flow (default folder, default filters, etc.). Always use `show.ShowInterface/CreateShow` via the REST gateway (see below). DB-level settings (subscriptions, service overrides, folder priorities, semester metadata) are fine to apply via SQL *after* the show exists in cuebot.

12. **"Job is already pending" on resubmit** — OpenCue rejects duplicate job names. If a user gets `Gateway error: 500` with message `Failed to add job to launch queue: The job <name> is already pending`, it means a job with the same name is still in the queue (running, waiting, or dead but not finished). The user must kill/eat the existing job first, or change parameters that affect the job name (scene file, shot code) to produce a unique name.

13. **Scene file path must include extension** — The submit form allows manual entry of scene file paths. If the user omits the `.ma`/`.mb` extension, Maya will fail with `File not found` and RQD reports exit code **211** (Maya exit 209). The file browser dialog always includes extensions; this only happens with manual/pasted paths.

14. **Arnold resolution override needs `-ard`** — When overriding resolution with `-x`/`-y`, Arnold uses the scene file's original device aspect ratio, causing skewed renders. The submit form now automatically appends `-ard <width/height>` when Arnold is the renderer and resolution override is enabled.

15. **Exit code 211 / Signal 83** — This is RQD's wrapper exit code when Maya crashes or can't load. Check the `.rqlog` file for the actual Maya error. Common causes: missing scene file (no extension), missing textures, license server down. Logs are at `/angd_server_pool/renderRepo/OpenCue/Logs/<show>/<shot>/logs/<jobdir>/`.

---

## Create a New Show (End-to-End)

Shows must be created through the REST gateway (which proxies to cuebot gRPC). Direct database inserts will not work — see Gotcha #11.

### Step 1 — Generate a JWT

```bash
ssh REDACTED_USER@REDACTED_IP 'docker exec cuesubmit-web node -e "
  const crypto=require(\"crypto\");
  const h=Buffer.from(JSON.stringify({alg:\"HS256\",typ:\"JWT\"})).toString(\"base64url\");
  const p=Buffer.from(JSON.stringify({sub:\"admin\",iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString(\"base64url\");
  const sig=crypto.createHmac(\"sha256\",\"REDACTED_SECRET\").update(h+\".\"+p).digest(\"base64url\");
  console.log(h+\".\"+p+\".\"+sig);
"'
```

### Step 2 — Create the Show via API

```bash
ssh REDACTED_USER@REDACTED_IP "curl -s -X POST http://127.0.0.1:8448/show.ShowInterface/CreateShow \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <JWT>' \
  -d '{\"name\":\"<SHOW_NAME>\"}'"
```

The response includes the new show's UUID (`id` field). Save it — you'll need it for the SQL steps.

### Step 3 — Verify cuebot sees it

```bash
ssh REDACTED_USER@REDACTED_IP "curl -s -X POST http://127.0.0.1:8448/show.ShowInterface/GetActiveShows \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <JWT>' \
  -d '{}' | python3 -c \"import sys,json; data=json.load(sys.stdin); [print(s['name']) for s in data['shows']['shows']]\""
```

### Step 4 — Apply DB-level settings

After the show exists in cuebot, apply subscriptions, service overrides, folder priorities, and semester metadata via SQL. Example (adjust values as needed):

```sql
BEGIN;

-- Set show-level core defaults
UPDATE show SET int_default_min_cores = 800, int_default_max_cores = 200000
WHERE str_name = '<SHOW_NAME>';

-- Create a subscription (links show to an allocation with core limits)
INSERT INTO subscription (pk_subscription, pk_show, pk_alloc, int_size, int_burst)
SELECT gen_random_uuid(),
       (SELECT pk_show FROM show WHERE str_name = '<SHOW_NAME>'),
       pk_alloc, 200000, 200000
FROM alloc WHERE str_name = '<ALLOC_NAME>';

-- Show-level service override (optional — controls per-frame core/memory usage)
INSERT INTO show_service (pk_show_service, pk_show, str_name,
       b_threadable, int_cores_min, int_cores_max,
       int_mem_min, int_gpu_min, int_gpu_mem_min, str_tags, int_timeout, int_timeout_llu)
SELECT gen_random_uuid(),
       (SELECT pk_show FROM show WHERE str_name = '<SHOW_NAME>'),
       'maya', true, 800, 800, 8388608, 0, 0, '', 180, 0;

-- Set folder priority (dispatch order)
UPDATE folder SET int_priority = 10
WHERE pk_show = (SELECT pk_show FROM show WHERE str_name = '<SHOW_NAME>')
  AND str_name = '<SHOW_NAME>';

-- Set semester metadata (so the web UI groups it properly)
INSERT INTO show_metadata (pk_show, str_semester)
VALUES ((SELECT pk_show FROM show WHERE str_name = '<SHOW_NAME>'), '<SEMESTER>');

COMMIT;
```

---

## Manage Allocations & Subscriptions

### List allocations and host counts

```sql
SELECT a.str_name AS alloc, COUNT(h.pk_host) AS hosts,
       SUM(h.int_cores) AS total_cores
FROM alloc a
LEFT JOIN host h ON h.pk_alloc = a.pk_alloc
GROUP BY a.str_name ORDER BY a.str_name;
```

### Move hosts to a different allocation

```sql
UPDATE host SET pk_alloc = (SELECT pk_alloc FROM alloc WHERE str_name = '<TARGET_ALLOC>')
WHERE str_name IN ('host1', 'host2', 'host3');
```

### Create an allocation

```sql
INSERT INTO alloc (pk_alloc, pk_facility, str_name, str_tag, b_billable, b_default)
VALUES (gen_random_uuid(),
        (SELECT pk_facility FROM facility WHERE str_name = 'local'),
        '<NAME>', '<TAG>', false, false);
```

### Create a subscription (link a show to an allocation)

```sql
INSERT INTO subscription (pk_subscription, pk_show, pk_alloc, int_size, int_burst)
VALUES (gen_random_uuid(),
        (SELECT pk_show FROM show WHERE str_name = '<SHOW_NAME>'),
        (SELECT pk_alloc FROM alloc WHERE str_name = '<ALLOC_NAME>'),
        200000, 200000);
```

### View subscriptions

```sql
SELECT s.str_name AS show, a.str_name AS alloc,
       sub.int_size, sub.int_burst, sub.int_cores AS running_cores
FROM subscription sub
JOIN show s ON s.pk_show = sub.pk_show
JOIN alloc a ON a.pk_alloc = sub.pk_alloc
ORDER BY s.str_name;
```

---

## Service Configuration

### View global services

```sql
SELECT str_name, b_threadable, int_cores_min, int_cores_max,
       int_mem_min / 1024 AS mem_min_mb, int_timeout, str_tags
FROM service ORDER BY str_name;
```

### Update a global service

```sql
UPDATE service SET int_cores_max = 2800, int_mem_min = 16777216, int_timeout = 180
WHERE str_name = 'maya';
```

### View per-show service overrides

```sql
SELECT s.str_name AS show, ss.str_name AS service,
       ss.int_cores_min, ss.int_cores_max,
       ss.int_mem_min / 1024 AS mem_min_mb, ss.int_timeout
FROM show_service ss
JOIN show s ON s.pk_show = ss.pk_show
ORDER BY s.str_name;
```

---

## Show Dispatch Priorities

Folder priority controls which show gets frames dispatched first. Higher = more priority.

```sql
-- View current priorities
SELECT s.str_name AS show, f.str_name AS folder, f.int_priority
FROM folder f JOIN show s ON s.pk_show = f.pk_show
WHERE f.str_name = s.str_name
ORDER BY f.int_priority DESC;

-- Set priority
UPDATE folder SET int_priority = 100
WHERE pk_show = (SELECT pk_show FROM show WHERE str_name = '<SHOW_NAME>')
  AND str_name = '<SHOW_NAME>';
```

---

## Host Tag Cleanup

Remove duplicate tags (e.g., lowercase variants that duplicate uppercase group tags):

```sql
-- Find duplicate-style tags
SELECT DISTINCT unnest(string_to_array(str_tags, ' | ')) AS tag
FROM host ORDER BY tag;

-- Remove a tag from all hosts
UPDATE host SET str_tags = trim(both ' | ' FROM
  regexp_replace(str_tags, '(^| \| )badtag( \| |$)', '\1', 'g'))
WHERE str_tags LIKE '%badtag%';
```

---

## Restart Services

### Cuebot (bare process, not Docker)

```bash
ssh REDACTED_USER@REDACTED_IP

# Find PID
ps aux | grep cuebot | grep -v grep

# Restart (adjust jar path if version changes)
kill <PID>
nohup java -jar /opt/opencue/cuebot-1.13.8-all.jar \
  --datasource.cue-data-source.jdbc-url=jdbc:postgresql://127.0.0.1:5432/cuebot_local \
  --datasource.cue-data-source.username=cuebot \
  --datasource.cue-data-source.password=REDACTED_PASSWORD \
  > /opt/opencue/logs/cuebot.log 2>&1 &
```

### REST Gateway (Docker)

```bash
ssh REDACTED_USER@REDACTED_IP "docker restart opencue-rest-gateway"
```

### CueSubmit Web (Docker)

```bash
ssh REDACTED_USER@REDACTED_IP "docker restart cuesubmit-web"
```
