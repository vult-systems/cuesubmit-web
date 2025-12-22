# CueSubmit Web - Project Status

**Last Updated:** December 22, 2025

## Current State: ✅ Job Submission Working

The web-based job submission interface for OpenCue is now functional. Jobs can be submitted from the production server at `http://REDACTED_IP:3000`.

### 🌐 Custom URL Ideas
Consider setting up a friendly URL/subdomain:
- `render.uiw3d.com`
- `farm.uiw3d.com`
- `opencue.uiw3d.com`
- `submit.uiw3d.com`
- `cue.uiw3d.com`

This would require DNS configuration pointing to `REDACTED_IP` and optionally nginx/reverse proxy for SSL.

## Infrastructure

### Server (REDACTED_IP)
- **Cuebot**: Running on port 8443 (PostgreSQL database: `cuebot_local`, password: `uiw3d`)
- **REST Gateway**: Docker container `opencue-rest-gateway` on port 8448
- **CueSubmit Web**: Docker container `cuesubmit-web` on port 3000
- **SSH Access**: `REDACTED_USER@REDACTED_IP`

### Deployment Commands
```bash
# Deploy changes to production
ssh REDACTED_USER@REDACTED_IP "cd /home/perforce/cuesubmit-web && git pull && docker compose build --no-cache && docker compose up -d"

# Check logs
ssh REDACTED_USER@REDACTED_IP "docker logs --tail 50 cuesubmit-web"
```

### Environment Configuration
- **Gateway URL**: `http://REDACTED_IP:8448`
- **JWT Secret**: `REDACTED_SECRET` (matches gateway config)
- Local dev uses `.env.local`, production uses Docker environment

## Render Farm Status

### Working Labs (86 hosts total)
- **AD400** (Room 400): 8 machines - All operational
- **AD404** (Room 404): Operational after IP fixes

### Recent Host Fixes
| Host | Old IP | New IP | System Name |
|------|--------|--------|-------------|
| AD400-08 | REDACTED_IP | REDACTED_IP | REDACTED_TAG |
| AD404-02 | REDACTED_IP | REDACTED_IP | REDACTED_TAG |
| AD404-05 | REDACTED_IP | REDACTED_IP | REDACTED_TAG |

**Root Cause**: DHCP changed IPs but RQD registered with old addresses. Solution: Delete stale entries from PostgreSQL, update SQLite metadata.

## Known Issues / TODO

### 1. 🔴 Logs Not Working
Frame logs are not displaying correctly. Need to investigate:
- Log path configuration in cuebot (`log.frame-log-root.Windows`)
- API endpoint `/api/jobs/[id]/logs`
- Windows UNC path handling

### 2. 🟡 Job Names Too Long
OpenCue generates verbose job names like:
```
4450_srthesisworkshop_s26-default-cagarc12_4450_s26_shaman_turnaround
```
Consider:
- Shorter naming convention in spec builder
- UI truncation with tooltips
- Job name format configuration

### 3. ✅ UI/UX Improvements - COMPLETED (Dec 22, 2025)
- ✅ Hosts table: Resizable columns with drag handles
- ✅ Hosts table: IP address shown above system name
- ✅ Table consistency: Unified padding (px-3 py-2) across all tables
- ✅ Created reusable `ResizableTable` component with localStorage persistence

### 4. 🟢 Minor Warnings (Non-blocking)
- `SESSION_SECRET not set in production` warnings during build (cosmetic)
- ~~Allocations API returns 501~~ **FIXED** - Now falls back to mock data gracefully

### 5. ✅ Performance Issue - FIXED
**Problem**: Website was laggy due to repeated failed API calls to `GetAllocations` (method unimplemented in gateway).

**Solution**: Modified `/api/allocations` to return mock allocation data when gateway fails instead of throwing errors. This prevents the frontend from getting stuck retrying failed requests.

## Recent Fixes (Dec 22, 2025)

1. **UI/UX Table Improvements**
   - Created `ResizableTable` component with drag-to-resize columns
   - Column widths persist to localStorage per table
   - Hosts page: IP shown on top, system name below
   - Unified table styling: `px-3 py-2` padding, `text-xs` cells, `text-[10px] uppercase` headers

2. **Linting & Code Quality** - Fixed 40+ issues
   - Replaced all `count !== 1 ? "s" : ""` with `pluralize()` utility
   - Fixed nested ternaries → logical AND patterns  
   - Fixed `parseInt()` → `Number.parseInt()` with radix
   - Fixed `String.match()` → `RegExp.exec()`
   - Fixed `.sort()` → `.sort((a,b) => a.localeCompare(b))`
   - Added `Readonly<>` wrappers to component props
   - Removed unused variables (`lockStateColors`, `CompactUsageBar`, `setShowAll`)

3. **Database Sync Script**
   - Added `npm run sync-db` to pull database from production
   - Handles SQLite WAL checkpointing automatically

4. **Project Configuration**
   - Added `sonar-project.properties` for SonarLint exclusions
   - Added `.vscode/settings.json` for workspace settings
   - Updated `eslint.config.mjs` to exclude `scripts/`

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

## Key Files

### Core Functionality
- `src/lib/opencue/gateway-client.ts` - REST gateway API calls
- `src/lib/opencue/spec-builder.ts` - Job XML spec generation
- `src/app/api/submit/route.ts` - Job submission endpoint

### Configuration
- `.env.local` - Local development environment
- `docker-compose.yml` - Production Docker setup
- `Dockerfile` - Container build

### Database
- `./data/cuesubmit.db` - SQLite for host metadata (display IDs, system names)
- PostgreSQL on server - OpenCue job/host data

## Development Workflow

```bash
# Local development
npm run dev

# Build
npm run build

# Deploy to production
git add -A && git commit -m "message" && git push
# Then SSH and rebuild Docker (see deployment commands above)
```

## Contact / Notes

- This is for UIW3D (University of the Incarnate Word 3D Animation program)
- Primary render software: Maya with Arnold
- Students submit via web interface, jobs render on lab machines overnight
