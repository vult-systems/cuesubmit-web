# CueWeb - OpenCue Render Farm Management

## Project Overview

CueWeb is a modern web-based interface for managing an OpenCue render farm, designed for a university 3D animation program. It provides job submission, monitoring, host management, and show organization.

## Architecture

### Stack
- **Frontend**: Next.js 16 (App Router), React, TailwindCSS
- **Backend**: Next.js API routes, SQLite (better-sqlite3)
- **Native App**: Zig-based macOS launcher with WebKit WebView
- **Render Farm**: OpenCue (via REST Gateway)

### Build Configuration
- `output: "standalone"` in next.config.ts for self-contained deployment
- TailwindCSS v4 with CSS variables for theming
- TypeScript strict mode

## Key Directories

```
/src
  /app
    /(dashboard)          # Authenticated pages
      /jobs               # Job monitoring & management
      /submit             # Job submission form
      /hosts              # Render node management
      /shows              # Show/project organization
      layout.tsx          # Dashboard layout with Header
    /api                  # REST API routes
      /auth               # Login, logout, session
      /jobs               # Job CRUD & frame data
      /hosts              # Host management
      /shows              # Show management
      /submit             # Job submission
    /login                # Login page
  /components
    /ui                   # shadcn/ui components
    header.tsx            # Navigation header
    grouped-section.tsx   # Collapsible section component
    job-detail-drawer.tsx # Job details side panel
  /lib
    /auth                 # Session management (iron-session)
    /db                   # SQLite database
    /opencue              # OpenCue gateway client
    config.ts             # Mode switching (online/offline)
    mock-data.ts          # Offline mode data
    accent-colors.ts      # UI color definitions
    icon-button-styles.ts # Consistent icon button styling

/launcher                 # Native macOS app
  /src
    main.zig              # Entry point, Node.js process management
    webview.zig           # Zig WebView bindings
    webview.m             # Objective-C WebKit implementation
  /app                    # Embedded Next.js standalone build
  build.zig               # Zig build configuration
  config.json             # Launcher configuration
```

## Operating Modes

### Offline Mode (`CUEWEB_MODE=offline`)
- Uses mock data from `/src/lib/mock-data.ts`
- No connection to OpenCue required
- Default for development and local testing

### Online Mode (`CUEWEB_MODE=online`)
- Connects to live OpenCue REST Gateway
- Requires `REST_GATEWAY_URL` environment variable
- Used in production

## UI Design System

### Theme
- Light/dark mode support via `next-themes`
- CSS variables for colors in `globals.css`
- Custom semantic color tokens: `text-primary`, `text-muted`, `surface-muted`, etc.

### Components
- **GroupedSection**: Collapsible sections with accent-colored left borders
- **accentColorList**: Rotating colors for visual grouping (blue, violet, emerald, amber, rose)
- **iconButton styles**: Consistent hover states for action buttons

### Page Patterns
- Jobs: Grouped by show, expandable job rows with frame details
- Hosts: Grouped by room (uppercase names), usage bars for resources
- Shows: Grouped by semester (F25, S25 format)
- Submit: Form with show selector, frame range, file browser

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CUEWEB_MODE` | No | `online` or `offline` (default: offline) |
| `REST_GATEWAY_URL` | For online | OpenCue REST gateway URL |
| `CUEWEB_API_BASE` | No | Alternative API base URL |
| `SESSION_SECRET` | For prod | Session encryption key (32+ chars) - warns if not set in production |
| `JWT_SECRET` | For prod | JWT signing key for job submission |
| `ADMIN_INITIAL_PASSWORD` | For prod | Initial admin password (change immediately after first login) |
| `DATABASE_PATH` | No | Custom SQLite path |
| `USE_HTTPS` | No | Set to `true` for HTTPS cookies |

## Security Notes

### Sensitive Files (gitignored)
- `config.json` - Local launcher configuration with paths
- `launcher/config.json` - Same
- `.env*` - Environment files
- `data/` - SQLite database with user credentials

### Default Admin User
- On first run, creates admin user with random password
- Set `ADMIN_INITIAL_PASSWORD` env var to specify initial password
- **Always change password immediately in production**

### Session Security
- Uses iron-session with encrypted cookies
- `SESSION_SECRET` required for production (warns if missing)
- Cookies are httpOnly and sameSite=lax

## Mock Data Structure

### Shows (`/src/lib/mock-data.ts`)
```typescript
interface ShowData {
  id: string;
  name: string;
  tag: string;           // Short code (e.g., "NLG")
  description: string;
  active: boolean;
  defaultMinCores: number;
  defaultMaxCores: number;
  bookingEnabled: boolean;
  semester?: string;     // Format: "F25", "S26" (Fall/Spring + year)
}
```

### Hosts
- Grouped by `allocationName` which maps to room names
- Room names displayed uppercase
- Properties: cores, memory, GPU, state, lockState

### Jobs
- Grouped by show
- States: PENDING, RUNNING, FINISHED, DEAD
- Frame data fetched on expansion

## Building

### Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
# Output in .next/standalone
```

### Native macOS Launcher
```bash
cd launcher
zig build
# Output: zig-out/bin/cueweb-launcher
```

### Updating Launcher with Fresh Build
```bash
# 1. Build Next.js
npm run build

# 2. Copy to launcher
cd launcher/app
rm -rf .next
cp -r ../../.next/standalone/. .
cp -r ../../.next/static .next/static

# 3. Rebuild Zig launcher
cd ..
rm -rf zig-out && zig build
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with username/password
- `POST /api/auth/logout` - Logout
- `GET /api/auth/session` - Get current session

### Jobs
- `GET /api/jobs` - List all jobs
- `GET /api/jobs/[id]` - Get job details
- `GET /api/jobs/[id]/frames` - Get frame data
- `POST /api/jobs/[id]` - Job actions (kill, pause, resume, retry)

### Hosts
- `GET /api/hosts` - List all hosts
- `POST /api/hosts/[id]` - Host actions (lock, unlock, reboot)

### Shows
- `GET /api/shows` - List shows (add `?all=true` for all)
- `POST /api/shows` - Create show
- `POST /api/shows/[id]` - Show actions (rename, activate, deactivate, delete)

### Submit
- `POST /api/submit` - Submit new job

## Current State (December 2025)

### Recently Implemented
- Semester-based grouping for Shows page (F25, S26 format)
- Center-aligned table columns with left padding (`pl-8`) for Name, right padding (`pr-8`) for Actions
- GroupedSection component for consistent collapsible UI
- Accent color system for visual grouping
- Native macOS launcher with Zig + WebKit
- Security hardening: random admin passwords, gitignored config files, session secret warnings

### Mock Data
Currently configured with single show for testing:
- Fall 2025: "Nightlight Guardians" (NLG)

To add more shows, edit `/src/lib/mock-data.ts` SHOWS array.

## Files Overview

### Configuration Files
- `config.json` - Local launcher config (gitignored)
- `config.json.production.example` - Production config template
- `.env.production.example` - Environment variables template

### Key Source Files
- `src/lib/auth/session.ts` - Session management with iron-session
- `src/lib/db/index.ts` - SQLite database with user management
- `src/lib/config.ts` - Mode switching (online/offline)
- `src/lib/mock-data.ts` - Offline mode data
- `src/components/grouped-section.tsx` - Collapsible section component

## Notes for Development

1. **Table Alignment**: Shows page uses `pl-8` for Name column left padding, `pr-8` for Actions right padding, all other columns centered

2. **GroupedSection**: Always pass `defaultOpen={true}` unless you want sections collapsed

3. **Mode Checking**: Use `config.mode === "offline"` to conditionally return mock data in API routes

4. **Session**: Uses iron-session stored in cookies, auto-redirects to login if not authenticated

5. **TypeScript**: Run `npx tsc --noEmit` to check for errors before committing

6. **Security**: Never commit `config.json`, `.env` files, or `data/` directory

7. **Building Launcher**: After any Next.js changes, must rebuild and copy to launcher:
   ```bash
   npm run build
   cd launcher/app && rm -rf .next
   cp -r ../../.next/standalone/. .
   cp -r ../../.next/static .next/static
   cd .. && zig build
   ```
