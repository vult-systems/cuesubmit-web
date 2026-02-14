# CueSubmit Web

A modern web interface for [OpenCue](https://www.opencue.io/) render farm management, built with Next.js. Designed for university render labs running Maya, Blender, and other DCC applications.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![OpenCue](https://img.shields.io/badge/OpenCue-1.13-green)

## Features

- **Job Submission** - Submit render jobs with auto-versioning job names and DTD-compliant XML specs
- **Job Monitoring** - View job progress, frames, and logs in real-time
- **Host Management** - Monitor render nodes grouped by lab with resizable columns and metadata display
- **Show Management** - Create and manage shows with semester organization
- **Production Tracking** - Shot tracking with table/grid/color-script views and thumbnail sync
- **User Management** - Role-based access (admin, manager, student)
- **File Browser** - Browse network paths for scene selection
- **Offline Mode** - Graceful fallback when OpenCue connection unavailable
- **Resizable Tables** - Drag-to-resize columns with localStorage persistence

## Prerequisites

- Node.js 18+
- OpenCue REST Gateway (for online mode)
- PostgreSQL (for Cuebot)

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your settings

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Configuration

### Environment Variables

```bash
# .env.local
CUEWEB_MODE=offline                          # online or offline
REST_GATEWAY_URL=http://localhost:8448        # REST Gateway URL
JWT_SECRET=                                  # Session signing key (32+ chars)
SESSION_SECRET=                              # Session encryption key (32+ chars)
ADMIN_INITIAL_PASSWORD=changeme              # Initial admin password
FILE_SERVER_IP=                              # File server for UNC paths
```

See [.env.example](.env.example) for all available variables.

### Operating Modes

- **Online Mode** (`CUEWEB_MODE=online`) — Connects to OpenCue REST Gateway for live data
- **Offline Mode** (`CUEWEB_MODE=offline`) — Uses mock data for development/testing

## Project Structure

```text
src/
├── app/                    # Next.js App Router
│   ├── (dashboard)/        # Authenticated pages (jobs, submit, hosts, shows, production, admin)
│   ├── api/                # REST API routes
│   └── login/              # Authentication
├── components/             # React components
│   ├── ui/                 # shadcn/ui components (resizable-table, etc.)
│   └── *.tsx               # Feature components
└── lib/
    ├── opencue/            # OpenCue client (gateway-client, spec-builder)
    ├── auth/               # Session & permissions
    └── db/                 # SQLite for local metadata

opencue/                    # OpenCue reference codebase (NOT part of build)
scripts/                    # Build/deployment scripts (sync-db.js)
data/                       # Local database (cuesubmit.db, gitignored)
```

## Documentation

- [Project Context](docs/context.md) - Architecture, coding standards, key files, gotchas
- [Project Status](docs/project-status.md) - Current status, known issues, recent fixes
- [Admin Operations](docs/admin-operations.md) - Deployment, DB queries, service management

## Deployment

### Docker (Production)

```bash
# Build and deploy
docker compose up -d --build

# View logs
docker logs --tail 50 cuesubmit-web
```

### Docker (Development)

```bash
docker compose -f docker-compose.dev.yml up
```

## Host Metadata

The app maintains local metadata for render hosts (display IDs, system names) in SQLite at `data/cuesubmit.db`. This supplements OpenCue's host data with lab-specific naming.

Sync from production:

```bash
npm run sync-db
```

## API Routes

| Route | Description |
| --- | --- |
| `/api/jobs` | List/manage render jobs |
| `/api/shows` | List/manage shows |
| `/api/hosts` | List/manage render hosts |
| `/api/submit` | Submit new render jobs |
| `/api/users` | User management |
| `/api/files/*` | File browsing and preview |
| `/api/production/*` | Shot tracking and thumbnails |

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5 (strict mode)
- **UI**: Tailwind CSS, shadcn/ui, Radix primitives
- **Database**: SQLite (better-sqlite3) for local metadata
- **Auth**: Cookie-based sessions (iron-session) with bcrypt
- **Linting**: ESLint, SonarLint, markdownlint

## Contributing

See [docs/context.md](docs/context.md) for coding standards and project conventions.

## License

MIT
