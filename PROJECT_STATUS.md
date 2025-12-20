# CueSubmit Web - Project Status

**Last Updated:** December 19, 2025

## Current State: ✅ Job Submission Working

The web-based job submission interface for OpenCue is now functional. Jobs can be submitted from the production server at `http://REDACTED_IP:3000`.

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

### 3. 🟡 UI/UX Improvements Needed
- Review submit form layout
- Improve job/frame status indicators
- Better error messages
- Mobile responsiveness
- Dark mode polish

### 4. 🟢 Minor Warnings (Non-blocking)
- `SESSION_SECRET not set in production` warnings during build (cosmetic)
- Allocations API returns 501 (method unimplemented in gateway - not critical)

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
