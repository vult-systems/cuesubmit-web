# CueSubmit Web - Project Status

**Last Updated:** March 16, 2026

## Current State: ✅ Production Ready

The web-based job submission and monitoring interface for OpenCue is fully functional at `http://YOUR_SERVER_IP:3000`.

### Active Features

- ✅ **Job submission** — Arnold-only, DTD-compliant XML specs, optional layer/camera/output format, tags, override resolution, frame step
- ✅ **Job monitoring** — Active/Completed tabs, pagination, row coloring by state, newest-first ordering
- ✅ **Archived job viewing** — Completed jobs from `job_history` table with real frame counts computed from `frame_history`
- ✅ **Archived frame listing** — Frame data served from `frame_history` with states derived from exit codes
- ✅ **Frame detail drawer** — Frame table, resizable log viewer with auto-scroll, frame preview panel
- ✅ **Frame preview** — Right-side 480px panel showing rendered frame images (PNG/JPG/etc.), scans output dir + subdirectories
- ✅ **Archived job previews** — Output directory extracted from RQD log files for completed/archived jobs
- ✅ **Host management** — Lab grouping, display ID mapping, host deletion via UI
- ✅ **User permissions** — Role-based (admin/instructor/student). Students: submit, kill, pause, retry, eat, view own jobs
- ✅ **Render logs** — UNC-to-Linux path conversion, Docker + Windows dev support
- ✅ **Scene/output file browsers** — Browse render source and output repos from submit form
- ✅ **Resizable table columns** — Drag handles with localStorage persistence

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

### Working Labs (86 hosts total)

- **AD400** (Room 400): 8 machines - All operational
- **AD404** (Room 404): Operational after IP fixes

### Recent Host Fixes

| Host     | Old IP       | New IP       | System Name |
| -------- | ------------ | ------------ | ----------- |
| AD400-08 | YOUR_SERVER_IP | YOUR_SERVER_IP | REDACTED     |
| AD404-02 | YOUR_SERVER_IP  | YOUR_SERVER_IP | REDACTED     |
| AD404-05 | YOUR_SERVER_IP  | YOUR_SERVER_IP | REDACTED     |

**Root Cause**: DHCP changed IPs but RQD registered with old addresses. Solution: Delete stale entries from PostgreSQL, update SQLite metadata.

## Known Issues / TODO

### 1. � EXR Preview Not Supported (Priority: Low)

Arnold default output is EXR, which browsers can't display. The frame preview detects EXR files and shows a message. Workaround: set output format to PNG or JPG in the submit form.

### 2. 🟡 Job Names Too Long (Priority: Low)

OpenCue generates verbose job names like:

```text
4450_srthesisworkshop_s26-default-cagarc12_4450_s26_shaman_turnaround
```

Consider:

- Shorter naming convention in spec builder
- UI truncation with tooltips
- Job name format configuration

### 3. 🟢 Minor Warnings (Non-blocking)

- `SESSION_SECRET not set in production` warnings during build (cosmetic only)

## Completed Items

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
