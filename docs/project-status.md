# CueSubmit Web - Project Status

**Last Updated:** April 21, 2026

## Current State: ✅ Production Ready

The web-based job submission and monitoring interface for OpenCue is fully functional at `http://YOUR_SERVER_IP:3000`.

### Active Features

- ✅ **Job submission** — Arnold-only, DTD 1.13 XML specs with `<maxcores>`, optional layer/camera/output format, tags, override resolution, frame step
- ✅ **Job monitoring** — Active/Completed tabs, pagination, row coloring by state, newest-first ordering
- ✅ **Archived job viewing** — Completed jobs from `job_history` table with real frame counts computed from `frame_history`
- ✅ **Archived frame listing** — Frame data served from `frame_history` with states derived from exit codes
- ✅ **Frame detail drawer** — Frame table, resizable log viewer with auto-scroll, frame preview panel
- ✅ **Frame preview** — Right-side 480px panel showing rendered frame images (PNG/JPG/EXR/TIFF/HDR/DPX), scans output dir + subdirectories, server-side ffmpeg conversion for non-browser formats
- ✅ **Archived job previews** — Output directory extracted from RQD log files for completed/archived jobs
- ✅ **P4 Sync** — One-click Perforce depot sync from submit page header, with loading/success/error visual feedback
- ✅ **Host management** — Lab grouping by tag-derived display ID (e.g., `AD415-05`), uppercase hostname display, host deletion via UI
- ✅ **User permissions** — Role-based (admin/instructor/student). Students: submit, kill, pause, retry, eat, view own jobs
- ✅ **Render logs** — UNC-to-Linux path conversion, Docker + Windows dev support
- ✅ **Scene/output file browsers** — Browse render source and output repos from submit form
- ✅ **Resizable table columns** — Drag handles with localStorage persistence
- ✅ **OpenCue client auto-deploy** — Remote deploy via web UI triggers RQD restart + CueNimby relaunch in the logged-in user's session automatically

### 🌐 Custom URL Ideas

Consider setting up a friendly URL/subdomain:

- `render.uiw3d.com`
- `farm.uiw3d.com`
- `opencue.uiw3d.com`
- `submit.uiw3d.com`
- `cue.uiw3d.com`

This would require DNS configuration pointing to `YOUR_SERVER_IP` and optionally nginx/reverse proxy for SSL.

## Infrastructure

### Server (YOUR_SERVER_IP)

- **Cuebot**: Running on port 8443 (PostgreSQL database: `cuebot_local`, password: `YOUR_DB_PASSWORD`)
- **REST Gateway**: Docker container `opencue-rest-gateway` on port 8448
- **CueSubmit Web**: Docker container `cuesubmit-web` on port 3000
- **P4 Sync Listener**: systemd service `p4Sync.service` on port 5005 (Flask, runs `p4 sync` against `ANGDRenderFarm` client)
- **SSH Access**: `YOUR_SSH_USER@YOUR_SERVER_IP`

### Deployment Commands

```bash
# Standard deploy — uses Docker layer cache, fast when only code changes (~20-30s)
ssh YOUR_SSH_USER@YOUR_SERVER_IP "cd /home/perforce/cuesubmit-web && git pull && docker compose build && docker compose up -d"

# Full rebuild — only needed when Dockerfile or system dependencies change (~80s)
ssh YOUR_SSH_USER@YOUR_SERVER_IP "cd /home/perforce/cuesubmit-web && git pull && docker compose build --no-cache && docker compose up -d"

# Check logs
ssh YOUR_SSH_USER@YOUR_SERVER_IP "docker logs --tail 50 cuesubmit-web"
```

### Environment Configuration

- **Gateway URL**: `http://YOUR_SERVER_IP:8448`
- **JWT Secret**: ``${JWT_SECRET}` (matches gateway config)
- Local dev uses `.env.local`, production uses Docker environment

## Render Farm Status

### Labs (6 rooms, ~100 hosts in local.general)

| Room | Hosts | Cores/Host | Tags | Example Display ID |
|------|-------|-----------|------|--------------------|
| AD400 | ~8 | 28 | `general`, `AD400`, `AD400-NN` | `AD400-01` |
| AD404 | ~15 | 28 | `general`, `AD404`, `AD404-NN` | `AD404-12` |
| AD405 | ~15 | 28 | `general`, `AD405`, `AD405-NN` | `AD405-INST` |
| AD406 | ~15 | 28 | `general`, `AD406`, `AD406-NN` | `AD406-03` |
| AD407 | ~15 | 28 | `general`, `AD407`, `AD407-NN` | `AD407-07` |
| AD415 | ~17 | 28 | `general`, `AD415`, `AD415-NN` | `AD415-05` |

> **Display IDs are derived from tags.** The hosts page extracts the most specific tag matching `LETTERS+DIGITS-SUFFIX` (e.g., `AD415-05`) and uses it as the display ID. No metadata DB lookup needed.

### Allocation Model

- **`local.general`** — Universal allocation containing all lab machines. All shows subscribe to this.
- **`local.ad405`** — Used only by the `sndbx` (sandbox) show.
- Per-room allocations (`local.ad400`, `local.ad404`, etc.) exist but are not used for show subscriptions.

### Tag-Based Dispatch

To target a specific room, set the layer's `<tags>` to the room name (e.g., `AD415`). OpenCue matches hosts whose tag set **contains** the layer tag. To target all machines, use `general`.

### Dispatch Limits (Configured Apr 2026)

| Limit | Value | Where Set |
|-------|-------|-----------|
| Show `defaultMaxCores` | 2000 cores | `setShowDefaultMaxCores()` on show creation |
| Subscription burst | 2000 cores | `createSubscription()` on show creation |
| Job `maxCores` | 2000 cores | `<maxcores>` in job spec XML |

All three must be high enough or dispatch is throttled. See [Dispatch Throttle Fix (Apr 17, 2026)](#-dispatch-throttle-fix-apr-17-2026) below.

## Known Issues / TODO

### 1. 🟡 Job Names Too Long (Priority: Low)

OpenCue generates verbose job names like:

```text
4450_srthesisworkshop_s26-default-cagarc12_4450_s26_shaman_turnaround
```

Consider:

- Shorter naming convention in spec builder
- UI truncation with tooltips
- Job name format configuration

### 2. 🟢 Minor Warnings (Non-blocking)

- `SESSION_SECRET not set in production` warnings during build (cosmetic only)

## Completed Items

### ✅ OpenCue Client Auto-Deploy with CueNimby Relaunch (Apr 21, 2026)

**Problem**: After a remote deploy pushed new CueNimby/RQD files to a render station, OpenCueRQD did not restart and CueNimby did not reappear in the system tray. A user had to manually relaunch the app on every machine.

**Solution**: `UPDATE.bat` (runs on the client as SYSTEM during deployment) now:
1. Copies all updated files from the deploy share
2. Schedules `post-update.ps1` to run ~40 seconds later via `schtasks /create /ru SYSTEM /rl HIGHEST`
3. `post-update.ps1` restarts the `OpenCueRQD` Windows service, then detects the logged-in user via `Win32_ComputerSystem.UserName` + `explorer.exe GetOwner`
4. Registers a per-user `Register-ScheduledTask -LogonType Interactive` task whose action runs `cmd.exe /c taskkill /F /IM pythonw.exe & wscript.exe StartCueNimby.vbs` in the user's own session (so taskkill has authority across Windows 11's session boundary)

**Bugs discovered and fixed during development:**

| # | Bug | Symptom | Fix |
|---|-----|---------|-----|
| 1 | Inline `powershell.exe -Command "^..."` in UPDATE.bat | Script hangs at "Scheduling post-update task" — no further log output | Replace with `schtasks /create` native + minimal one-shot PS call for time calculation |
| 2 | `Win32_LogonSession` for domain accounts | 80+ CIM queries all return `\` (empty username), taking 28 seconds total | Remove entirely; use `explorer.exe GetOwner` instead |
| 3 | PS 5.1 variable state after heavy CIM queries | `Test-Path $VBS` returns False even though file was confirmed to exist 15 seconds earlier | Use single-quoted string literals for `Test-Path` |
| 4 | UTF-8 without BOM (written by VS Code file tools) | PS 5.1 reads files as Windows-1252; em dash corrupts to garbage; script fails before first line | Rewrite via terminal with pure ASCII (no characters > 127) |
| 5 | `-DeleteExpiredTaskAfter` in `New-ScheduledTaskSettingsSet` | `Register-ScheduledTask` fails: "task XML missing required element (47,4):EndBoundary:" | Remove the `-DeleteExpiredTaskAfter` parameter entirely |
| 6 | SYSTEM `Stop-Process -Force` cross-session on Windows 11 | pythonw.exe not killed → new one spawns → duplicate tray icons | Task action runs `cmd.exe /c taskkill /F /IM pythonw.exe & wscript.exe VBS` inside user's session |

**Key files:**

| File | Purpose |
|------|--------|
| `opencue/uiw3d_installers/OpenCue_Deploy/UPDATE.bat` | Runs on client as SYSTEM; copies files, schedules PS1 via schtasks |
| `opencue/uiw3d_installers/OpenCue_Deploy/post-update.ps1` | Restarts RQD + relaunches CueNimby in user session |
| `scripts/publish-to-share.ps1` | Publishes deploy files from repo to share |
| `scripts/opencue-deploy.js` | Submits maintenance frames to OpenCue targeting specific hosts |
| `src/app/(dashboard)/admin/deploy/page.tsx` | Web UI deploy page |

**Debug log location on clients**: `C:\OpenCue\logs\post-update-debug.log`

### ✅ Host Display ID from Tags (Apr 17, 2026)

**Problem**: All hosts showed as "Unassigned" after migrating host metadata from UUID-keyed to hostname-keyed. DNS-resolved hostnames didn't reliably match stored metadata.

**Solution**: Derive display IDs directly from OpenCue host tags instead of the SQLite metadata table.

| Change | Detail |
|--------|--------|
| Tag extraction | Regex `/^[A-Za-z]+\d+-\w+$/` finds tags like `AD415-05`, `AD405-INST` |
| Hostname display | Shown in uppercase (e.g., `C751M34`) via `.toUpperCase()` |
| Swap column | Removed from hosts table |
| Host-lookup route | Simplified — derives display ID from tags, removed DNS reverse lookup and metadata DB dependency |
| Edit dialog | Simplified to read-only host identification (ID from tags, hostname, IP) |

**Files Changed:**

| File | Change |
|------|--------|
| `src/app/(dashboard)/hosts/page.tsx` | `getDisplayIdFromTags()` helper, removed `hostMetadata` state, removed swap column, uppercase hostname |
| `src/app/api/host-lookup/route.ts` | Tag-based lookup, removed DNS/metadata dependencies |

### ✅ Dispatch Throttle Fix (Apr 17, 2026)

**Problem**: Jobs were only dispatching to ~6 machines regardless of farm size.

**Root Causes** (three independent throttles, all defaulting too low):

1. **Job `maxCores` = 100** — The job spec XML had no `<maxcores>` element. Without it, a PostgreSQL trigger in cuebot defaults `job_resource.int_max_cores` to 10,000 core units (100 cores). On 28-core hosts, that's ~3-4 machines.
2. **Show `defaultMaxCores` = 100** — The `show` table defaults `int_default_max_cores` to 10,000 core units. Never overridden during show creation.
3. **Subscription burst = 100** — Subscription burst defaulted to 100 cores, further capping dispatch.

**Fixes Applied:**

| File | Change |
|------|--------|
| `src/lib/opencue/spec-builder.ts` | Added `<maxcores>2000</maxcores>` to job spec XML, upgraded DTD from 1.12 → 1.13 |
| `src/app/api/shows/route.ts` | Auto-subscribe new shows to `local.general` (burst=2000), call `setShowDefaultMaxCores(2000)` on creation |
| `src/lib/opencue/gateway-client.ts` | Fixed `setSubscriptionBurst`/`setSubscriptionSize` to convert cores → centicores (×100) |
| `src/app/api/shows/[id]/subscriptions/route.ts` | Fixed GET response to convert centicores → cores (÷100), default burst 100 → 2000 |
| `src/app/api/migrate-subscriptions/route.ts` | One-shot migration endpoint to fix all existing shows |

**Unit Conversion Gotcha:** OpenCue uses "core units" (centicores) internally. `CreateSubscription` gRPC takes float cores (cuebot converts ×100), but `SetBurst`/`SetSize` take int32 centicores stored directly. The `<maxcores>` spec element takes whole cores (cuebot converts via `coresToWholeCoreUnits`).

### ✅ EXR/HDR Frame Preview (Mar 20, 2026)

- Added server-side ffmpeg conversion for non-browser image formats (EXR, TIFF, HDR, DPX)
- Converts to JPEG on-the-fly with `apply_trc iec61966_2_1` for proper HDR-to-sRGB tonemapping
- Caches converted images in temp directory keyed by file path + modification time
- Installed `ffmpeg` in production Docker image (`apk add ffmpeg`)
- Previously returned 415 "not viewable in browser" — now renders inline

### ✅ Frame 0 Support (Mar 20, 2026)

- Changed Zod validation for `frameStart` and `frameEnd` from `.min(1)` to `.min(0)`
- Allows submitting render jobs starting at frame 0

### ✅ Archived Job Previews (Mar 16, 2026)

- Created `/api/jobs/[id]/output-dir` endpoint that extracts the render output directory from archived RQD log files
- Log files at `<RENDER_REPO>/OpenCue/Logs/<show>/<shot>/logs/<jobName>--<jobId>/` contain the full render command in their header
- Reads the first 2KB of the first `.rqlog` file and parses `-rd "path"` to get the output directory
- Updated job detail drawer to fetch output dir for archived jobs, enabling the existing preview pipeline

### ✅ Archived Frame Listing (Mar 16, 2026)

- Created `getArchivedFrames()` in `database.ts` — queries `frame_history` table for completed job frames
- Derives real frame states from `int_exit_status` (archival stores all as `RUNNING`): exit 0 → `SUCCEEDED`, non-zero → `DEAD`
- Extracts frame numbers from names like `0001-render`
- Added `?archived=true` support to `/api/jobs/[id]/frames` route
- Updated drawer to fetch archived frames when `job.isArchived` is true

### ✅ Archived Job Frame Counts (Mar 16, 2026)

- `job_history.int_succeeded_count` is always 0 (Cuebot archival behavior)
- Fixed by computing real counts from `frame_history` via LEFT JOIN subquery in `getJobHistory()`
- Succeeded = `int_exit_status = 0 AND int_ts_stopped > int_ts_started`
- Dead = `int_exit_status != 0`
- Progress bars now show correct green/red proportions for archived jobs

### ✅ Completed Jobs Tab (Mar 16, 2026)

- Simplified Jobs page tabs from All/Running/Pending/Finished/Dead to **Active/Completed**
- Active tab: live jobs from REST Gateway
- Completed tab: archived jobs from `job_history` table via direct PostgreSQL query
- All shows always visible in Completed tab (groups from all filtered jobs, not just paginated page)
- Added `isArchived` flag to Job interface to distinguish archived from live jobs
- `allShows` state ensures show sections appear even when pagination hides some jobs

### ✅ Direct PostgreSQL Integration (Mar 16, 2026)

- Added `database.ts` with connection pool to OpenCue's PostgreSQL database
- `getJobHistory()` — fetches archived jobs with real frame counts from `frame_history`
- `getArchivedFrames()` — fetches archived frames with derived states
- `getShowJobHistoryStats()` — job/subscription counts for show management
- Uses `OPENCUE_DB_HOST` and `OPENCUE_DB_PASSWORD` environment variables

### ✅ Frame Preview Panel (Feb 8, 2026)

- Added Layer API (`getLayers()` in gateway-client, `/api/jobs/[id]/layers` route)
- Created `/api/files/frame-preview` — single endpoint that resolves paths (Docker Linux mounts / Windows UNC), scans for frame images with multiple padding formats, checks subdirectories
- Created `/api/files/preview` — direct image serving route
- Right-side 480px panel in job detail drawer showing rendered output per frame
- Graceful state handling (running → "still rendering", dead → "no output", waiting → "hasn't started")
- Blob URL memory leak prevention with cleanup ref

### ✅ Submit Form Overhaul (Feb 2026)

- Arnold-only renderer (removed multi-renderer complexity)
- Optional render layer, camera, output format fields
- Tags as free-text input
- Override resolution (width × height)
- Frame step support
- Scene file name auto-populates job name
- Two file browsers: render source repo + render output repo

### ✅ Student Permissions (Feb 2026)

- Students can kill, pause, retry, eat their own jobs
- Permission set: `['submit', 'kill', 'pause', 'retry', 'eat', 'view_own']`

### ✅ Jobs Page UX Overhaul (Feb 2026)

- Tab filtering: All / Running / Pending / Finished / Dead
- Pagination with page size selector
- Row coloring by job state
- Newest-first default ordering
- Host ID lookup (maps OpenCue host IDs to display names)
- Resizable log panel with auto-scroll toggle
- Updated hint: "Click on a frame row to view its render preview and log"

### ✅ Kill Button Fix (Feb 2026)

- Cuebot requires non-empty `reason` field — was silently ignoring kills

### ✅ Logs Route Fix (Jan 2026)

- Fixed `.gitignore` accidentally excluding the logs API route
- Fixed UNC-to-Linux path conversion for Docker environment

### ✅ Host Deletion (Jan 2026)

- Added trash icon to host table rows
- Calls `host.HostInterface/Delete` on the gateway + removes from SQLite metadata

### ✅ Mock Data Removal & DB Cleanup (Jan 2026)

- Removed all hardcoded mock data
- Cleaned NULL/orphaned host entries from SQLite
- Room Allocations section removed from Shows page

### ✅ UI/UX Improvements (Dec 22, 2025)

- Hosts table: Resizable columns with drag handles
- Hosts table: IP address shown above system name
- Table consistency: Unified padding (px-3 py-2) across all tables
- Created reusable `ResizableTable` component with localStorage persistence

### ✅ Performance Issue - Fixed

**Problem**: Website was laggy due to repeated failed API calls to `GetAllocations` (method unimplemented in gateway).

**Solution**: Modified `/api/allocations` to return mock allocation data when gateway fails instead of throwing errors.

### ✅ Allocations API - Fixed

Now falls back to mock data gracefully when gateway returns 501.

## Recent Fixes (Dec 22, 2025)

1. **SonarLint Code Quality Fixes** - Additional cleanup
   - `file-browser-dialog.tsx`: Fixed accessibility (button element), `String.raw` for paths
   - `header.tsx`: Added `Readonly<>` props wrapper, canonical Tailwind classes
   - All components: Proper `Readonly<>` wrappers on props

2. **UI/UX Table Improvements**
   - Created `ResizableTable` component with drag-to-resize columns
   - Column widths persist to localStorage per table
   - Hosts page: IP shown on top, system name below
   - Unified table styling: `px-3 py-2` padding, `text-xs` cells, `text-[10px] uppercase` headers

3. **Linting & Code Quality** - Fixed 40+ issues
   - Replaced all `count !== 1 ? "s" : ""` with `pluralize()` utility
   - Fixed nested ternaries → logical AND patterns  
   - Fixed `parseInt()` → `Number.parseInt()` with radix
   - Fixed `String.match()` → `RegExp.exec()`
   - Fixed `.sort()` → `.sort((a,b) => a.localeCompare(b))`
   - Added `Readonly<>` wrappers to component props
   - Removed unused variables (`lockStateColors`, `CompactUsageBar`, `setShowAll`)

4. **Database Sync Script**
   - Added `npm run sync-db` to pull database from production
   - Handles SQLite WAL checkpointing automatically

5. **Project Configuration**
   - Added `sonar-project.properties` for SonarLint exclusions
   - Added `.vscode/settings.json` for workspace settings
   - Updated `eslint.config.mjs` to exclude `scripts/`
   - Added [coding standards](context.md#coding-standards) with lint rules

## Recent Fixes (Dec 19, 2025)

1. **Job Spec XML Element Order** - Fixed DTD compliance
   - DTD requires: `(paused?,priority?,maxretries?,autoeat?,localbook?,os?,env*,layers?)`
   - Was incorrectly putting `<os>` first
   - File: `src/lib/opencue/spec-builder.ts`

2. **Codebase Cleanup**
   - Removed Claude tooling artifacts (.claude/, .hive-mind/, etc.)
   - Cleaned DEBUG console.log statements from API routes
   - Updated README with proper documentation
   - Added `opencue/` reference folder to repo



> For key files, architecture, coding standards, and dev workflow, see [context.md](context.md).
> For deployment, DB queries, and service management, see [admin-operations.md](admin-operations.md).
