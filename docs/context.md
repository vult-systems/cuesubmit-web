# CueSubmit Web — Project Context

> Primary reference for AI-assisted development. Contains architecture, conventions, key files, coding rules, and gotchas.

## What This Is

A Next.js web interface for [OpenCue](https://www.opencue.io/) render farm management at UIW3D (University of the Incarnate Word 3D Animation program). Students submit Maya/Arnold render jobs via the web UI; jobs run overnight on lab machines.

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React, Tailwind CSS, shadcn/ui, Radix |
| Backend | Next.js API routes, SQLite (better-sqlite3) |
| Auth | iron-session (encrypted cookies), bcrypt |
| Render Farm | OpenCue via REST Gateway (gRPC proxy) |
| Linting | ESLint, SonarLint, markdownlint |
| Build | TypeScript strict mode, `output: "standalone"` |

### Operating Modes

- **Online** (`CUEWEB_MODE=online`) — Connects to live OpenCue REST Gateway
- **Offline** (`CUEWEB_MODE=offline`) — Uses mock data from `src/lib/mock-data.ts`

## Directory Structure

```text
src/
├── app/
│   ├── (dashboard)/          # Authenticated pages
│   │   ├── jobs/             # Job monitoring (tabs, pagination, row coloring)
│   │   ├── submit/           # Job submission form (Arnold, file browsers)
│   │   ├── hosts/            # Host management (lab grouping, display IDs)
│   │   ├── shows/            # Show management (semester grouping)
│   │   ├── production/       # Shot tracking (table/grid/color-script views)
│   │   └── admin/            # User management
│   ├── api/                  # REST API routes
│   │   ├── auth/             # login, logout, session
│   │   ├── jobs/[id]/        # frames, layers, logs, actions
│   │   ├── files/            # browse, preview, frame-preview
│   │   ├── hosts/            # host CRUD
│   │   ├── shows/            # show CRUD
│   │   ├── production/       # acts, shots, statuses, thumbnails
│   │   ├── submit/           # job submission
│   │   └── users/            # user management
│   └── login/                # Login page
├── components/
│   ├── ui/                   # shadcn/ui (resizable-table, etc.)
│   ├── job-detail-drawer.tsx # Job detail: frames, logs, preview panel
│   ├── file-browser-dialog.tsx
│   ├── header.tsx
│   └── grouped-section.tsx
└── lib/
    ├── opencue/
    │   ├── gateway-client.ts # All REST gateway API calls
    │   ├── spec-builder.ts   # Job XML spec generation (DTD-compliant)
    │   └── database.ts       # Direct PostgreSQL queries (archived jobs, frames, show stats)
    ├── auth/
    │   ├── session.ts        # iron-session config
    │   └── permissions.ts    # Role-based permissions
    ├── db/
    │   ├── index.ts          # SQLite setup, user CRUD
    │   └── production.ts     # Production tracking tables
    └── config.ts             # Mode switching (online/offline)

docs/                         # Documentation (this folder)
opencue/                      # OpenCue reference codebase (NOT part of build)
scripts/                      # sync-db.js, seed-production.js, etc.
data/                         # SQLite database (gitignored)
```

## Key Files Quick Reference

| Purpose | File |
|---------|------|
| Gateway API client | `src/lib/opencue/gateway-client.ts` |
| Job XML spec builder | `src/lib/opencue/spec-builder.ts` |
| Session / auth | `src/lib/auth/session.ts` |
| Permissions (roles) | `src/lib/auth/permissions.ts` |
| SQLite DB setup | `src/lib/db/index.ts` |
| Production tracking DB | `src/lib/db/production.ts` |
| Job submission API | `src/app/api/submit/route.ts` |
| Frame log retrieval | `src/app/api/jobs/[id]/logs/route.ts` |
| Archived output dir | `src/app/api/jobs/[id]/output-dir/route.ts` |
| Frame preview API | `src/app/api/files/frame-preview/route.ts` |
| Job detail drawer | `src/components/job-detail-drawer.tsx` |
| Submit form | `src/app/(dashboard)/submit/page.tsx` |
| P4 Sync API | `src/app/api/p4-sync/route.ts` |
| PostgreSQL (archived) | `src/lib/opencue/database.ts` |
| Docker config | `docker-compose.yml`, `Dockerfile` |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CUEWEB_MODE` | No | `online` or `offline` (default: offline) |
| `REST_GATEWAY_URL` | For online | OpenCue REST gateway URL |
| `JWT_SECRET` | Production | JWT signing key (32+ chars) |
| `SESSION_SECRET` | Production | Session encryption key (32+ chars) — throws if missing in prod |
| `ADMIN_INITIAL_PASSWORD` | Production | Initial admin password |
| `DATABASE_PATH` | No | Custom SQLite path (default: `./data/cuesubmit.db`) |
| `OPENCUE_DB_HOST` | No | PostgreSQL host (default: localhost) |
| `OPENCUE_DB_PASSWORD` | For DB access | PostgreSQL password |
| `FILE_SERVER_IP` | For file access | File server IP for UNC paths |
| `NEXT_PUBLIC_FILE_SERVER_IP` | For file access | Same, exposed to client-side |
| `RENDER_REPO_PATH` | Docker | Linux mount path for render output |
| `RENDER_SOURCE_PATH` | Docker | Linux mount path for render source |
| `USE_HTTPS` | No | Set `true` for secure cookies |

## API Routes

### Auth

- `POST /api/auth/login` — Login
- `POST /api/auth/logout` — Logout
- `GET /api/auth/session` — Current session

### Jobs

- `GET /api/jobs` — List jobs (active from gateway, archived from `job_history` when `includeFinished=true`)
- `GET /api/jobs/[id]` — Job details
- `GET /api/jobs/[id]/frames` — Frame data (add `?archived=true` for archived jobs via `frame_history`)
- `GET /api/jobs/[id]/layers` — Layer data (for preview output dir extraction)
- `GET /api/jobs/[id]/logs` — Frame log content
- `GET /api/jobs/[id]/output-dir` — Extract output dir from archived RQD log files
- `POST /api/jobs/[id]` — Actions: kill, pause, resume, retry, eat

### Files

- `GET /api/files/browse` — Browse network paths
- `GET /api/files/preview` — Serve image by path
- `GET /api/files/frame-preview` — Find + serve frame image by output dir + frame number

### P4 Sync

- `POST /api/p4-sync` — Trigger Perforce depot sync (proxies to local `p4Sync.service` on port 5005)

### Other

- `GET/POST /api/shows` — Show CRUD
- `GET/POST /api/hosts` — Host CRUD
- `POST /api/submit` — Submit render job
- `GET/POST /api/users` — User management
- `GET/POST/PUT/DELETE /api/production/*` — Production tracking (acts, shots, statuses, thumbnails)

## Roles & Permissions

| Role | Can Do |
|------|--------|
| admin | Everything |
| manager | Everything except user management |
| student | submit, kill/pause/retry/eat own jobs, view own jobs |

## UI Patterns

- **GroupedSection** — Collapsible sections with accent-colored left borders. Pass `defaultOpen={true}` unless collapsed by default.
- **Accent colors** — Rotating: blue, violet, emerald, amber, rose (via `accentColorList`)
- **Tables** — `px-3 py-2` padding, `text-xs` cells, `text-[10px] uppercase` headers. Resizable columns persist to localStorage.
- **Theme** — Light/dark via `next-themes`, CSS variables in `globals.css`

## Coding Standards

### TypeScript / ESLint / SonarLint

| Rule | Bad | Good |
|------|-----|------|
| Regex shortcuts | `/[A-Za-z0-9_]/` | `/\w/` |
| Last element | `arr[arr.length - 1]` | `arr.at(-1)` |
| Global replace | `.replace(/x/g, y)` | `.replaceAll(/x/g, y)` |
| Regex capture | `str.match(re)` | `re.exec(str)` |
| Parse int | `parseInt(s)` | `Number.parseInt(s, 10)` |
| Immutable sort | `arr.sort()` | `arr.toSorted((a, b) => ...)` |
| Component props | `{ label }: { label: string }` | `{ label }: Readonly<{ label: string }>` |
| Pluralization | `` `${n} job${n !== 1 ? "s" : ""}` `` | `` `${n} ${pluralize("job", n)}` `` |
| React ref type | `React.ElementRef` | `React.ComponentRef` |
| Nested ternary | `a ? b : c ? d : e` | Extract to function or use `&&` |

### File Organization

**Import order:** React/Next → third-party → `@/components/` → `@/lib/` → types → relative

**Component structure:** Types → Constants → Helpers → Main component → Sub-components

### Markdown

- Blank lines before/after headings, lists, tables, code blocks
- Always specify language on fenced code blocks
- Spaces around pipe separators in tables

### Linting

```bash
npm run lint          # Check
npm run lint -- --fix # Auto-fix
```

Excluded from linting: `opencue/`, `scripts/`, `.next/`, `node_modules/`

## Build Notes

- **Windows build**: Must use `npm run build` (uses `--webpack` flag). Turbopack creates files with `:` in names which Windows doesn't support.
- **macOS build**: Can use either Turbopack or webpack.
- **Standalone output**: `next.config.ts` has `output: "standalone"` for self-contained deployment.
- **Docker builds**: Use `docker compose build` (no `--no-cache`) for normal deploys — Docker layer caching skips `npm ci` when only code changes (~20-30s vs ~80s). Only use `--no-cache` when the Dockerfile or system dependencies change.

## Gotchas

1. **Cuebot kill requires `reason`** — `JobKillRequest` with empty `reason` is silently ignored (returns 200 but does nothing). Always send a non-empty reason. Same for `KillFrames`.

2. **Shows must be created via API** — Direct SQL `INSERT INTO show` won't work because cuebot caches shows in memory. Use `show.ShowInterface/CreateShow` via the REST gateway.

3. **Frame preview needs `-rd` in render command** — For active jobs, the preview panel parses the layer command for `-rd "path"`. For archived jobs, the output dir is extracted from RQD log file headers via `/api/jobs/[id]/output-dir`. Without it, preview shows "No output directory found."

4. **EXR/TIFF won't preview** — Only browser-viewable formats work (PNG, JPG, GIF, WebP, BMP). Set `-of png` or `-of jpg` in the submit form for previewable output.

5. **Gateway returns HTML on 404** — If an API route isn't deployed, Next.js returns HTML → frontend gets `Unexpected token '<'`. Fix: verify route file is committed and rebuild.

6. **FK constraints on show delete** — Must delete in order: frames → layers → job_history → jobs → subscriptions → folders → show.

7. **Active hosts re-register** — Deleting a host only works for decommissioned machines. If RQD is still running, the host reappears.

8. **Scene file paths need extension** — Omitting `.ma`/`.mb` causes Maya exit code 211. The file browser always includes extensions; only happens with manual/pasted paths.

9. **Arnold resolution override needs `-ard`** — Override with `-x`/`-y` without `-ard <width/height>` causes skewed renders. The submit form auto-appends this.

10. **"Job is already pending"** — OpenCue rejects duplicate job names. Kill/eat the existing job first, or change parameters that affect the name.

11. **`npm run sync-db` fails with EBUSY** — Stop the dev server first. SQLite is locked while Next.js is running.

12. **Docker volumes are read-only** — Both render repo mounts are `:ro`. Logs/images can only be read, not written from the web container.

13. **`job_history.int_succeeded_count` is always 0** — Cuebot clears frame counts during archival. Real counts must be computed from `frame_history` by checking `int_exit_status` (0 = succeeded, non-zero = dead).

14. **`layer_history` has no `str_cmd`** — The render command is not preserved after archival. To get the output directory for archived jobs, read the RQD log file header which contains the full command including `-rd "path"`.

15. **`frame_history.str_state` is always `RUNNING`** — Cuebot archives all frames with state `RUNNING` regardless of actual outcome. Derive real states from `int_exit_status`: 0 with `int_ts_stopped > int_ts_started` = SUCCEEDED, non-zero = DEAD.

## Security

- All secrets via environment variables (never hardcoded)
- `.env*` files and `data/` are gitignored
- `SESSION_SECRET` throws in production if missing
- Admin password requires env var (random fallback in dev)
- Config files (`config.json`) are gitignored
