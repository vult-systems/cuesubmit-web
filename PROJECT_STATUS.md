# CueSubmit Web - Project Status

**Last Updated:** December 22, 2025

## Current State: ✅ Production Ready

The web-based job submission interface for OpenCue is fully functional. Jobs can be submitted from the production server at `http://10.40.14.25:3000`.

### Completed Features

- ✅ Job submission with DTD-compliant XML specs
- ✅ Job monitoring with real-time updates
- ✅ Host management with lab grouping
- ✅ Resizable table columns with persistence
- ✅ Graceful API fallbacks for unavailable endpoints
- ✅ Code quality: 40+ linting issues resolved

### 🌐 Custom URL Ideas

Consider setting up a friendly URL/subdomain:

- `render.uiw3d.com`
- `farm.uiw3d.com`
- `opencue.uiw3d.com`
- `submit.uiw3d.com`
- `cue.uiw3d.com`

This would require DNS configuration pointing to `10.40.14.25` and optionally nginx/reverse proxy for SSL.

## Infrastructure

### Server (10.40.14.25)

- **Cuebot**: Running on port 8443 (PostgreSQL database: `cuebot_local`, password: `uiw3d`)
- **REST Gateway**: Docker container `opencue-rest-gateway` on port 8448
- **CueSubmit Web**: Docker container `cuesubmit-web` on port 3000
- **SSH Access**: `perforce@10.40.14.25`

### Deployment Commands

```bash
# Deploy changes to production
ssh perforce@10.40.14.25 "cd /home/perforce/cuesubmit-web && git pull && docker compose build --no-cache && docker compose up -d"

# Check logs
ssh perforce@10.40.14.25 "docker logs --tail 50 cuesubmit-web"
```

### Environment Configuration

- **Gateway URL**: `http://10.40.14.25:8448`
- **JWT Secret**: `your-production-secret-32chars` (matches gateway config)
- Local dev uses `.env.local`, production uses Docker environment

## Render Farm Status

### Working Labs (86 hosts total)

- **AD400** (Room 400): 8 machines - All operational
- **AD404** (Room 404): Operational after IP fixes

### Recent Host Fixes

| Host     | Old IP       | New IP       | System Name |
| -------- | ------------ | ------------ | ----------- |
| AD400-08 | 10.40.14.140 | 10.40.14.190 | CTQD9R3     |
| AD404-02 | 10.40.14.57  | 10.40.14.235 | 4FQD9R3     |
| AD404-05 | 10.40.14.97  | 10.40.14.106 | DDQD9R3     |

**Root Cause**: DHCP changed IPs but RQD registered with old addresses. Solution: Delete stale entries from PostgreSQL, update SQLite metadata.

## Known Issues / TODO

### 1. 🔴 Logs Not Working (Priority: High)

Frame logs are not displaying correctly. Need to investigate:

- Log path configuration in cuebot (`log.frame-log-root.Windows`)
- API endpoint `/api/jobs/[id]/logs`
- Windows UNC path handling

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
   - `frame-log-dialog.tsx`: Reduced cognitive complexity from 17→15, extracted helper functions
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
   - Added [CODING_STANDARDS.md](CODING_STANDARDS.md) with lint rules

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
