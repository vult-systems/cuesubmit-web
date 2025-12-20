# CueSubmit Web

A modern web interface for [OpenCue](https://www.opencue.io/) render farm management, built with Next.js. Designed for university render labs running Maya, Blender, and other DCC applications.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![OpenCue](https://img.shields.io/badge/OpenCue-1.13-green)

## Features

- **Job Submission** - Submit render jobs with auto-versioning job names
- **Job Monitoring** - View job progress, frames, and logs in real-time
- **Host Management** - Monitor render nodes grouped by lab (AD400, AD404, etc.)
- **Show Management** - Create and manage shows with semester organization
- **User Management** - Role-based access (admin, instructor, student)
- **File Browser** - Browse network paths for scene selection
- **Offline Mode** - Works without OpenCue connection for testing

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
OPENCUE_GATEWAY_URL=http://localhost:8448  # REST Gateway URL
CUEBOT_HOST=REDACTED_IP                     # Cuebot server
SESSION_SECRET=your-secret-key              # For session encryption
ADMIN_INITIAL_PASSWORD=changeme             # Initial admin password
```

### Operating Modes

- **Online Mode** - Connects to OpenCue REST Gateway for live data
- **Offline Mode** - Uses mock data for development/testing

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (dashboard)/       # Dashboard pages (jobs, hosts, shows, etc.)
│   └── api/               # API routes
├── components/            # React components
└── lib/
    ├── opencue/          # OpenCue client (gateway-client, spec-builder)
    └── db/               # SQLite for local metadata

opencue/                   # OpenCue reference codebase
├── rqd/                  # Render Queue Daemon
├── pycue/                # Python client library
├── uiw3d_installers/     # Windows deployment tools
└── uiw3d_machinelist/    # Lab machine inventory (Excel)
```

## Deployment

### Docker

```bash
# Production build
docker compose up -d

# Development with hot reload
docker compose -f docker-compose.dev.yml up
```

### Desktop Launcher (Zig)

A native launcher that bundles the Next.js app:

```powershell
# Windows
cd launcher
.\build.bat

# Run
.\zig-out\bin\cueweb-launcher.exe --mode online --port 3000
```

## Host Metadata

The app maintains local metadata for render hosts (display IDs, system names) in SQLite at `data/cuesubmit.db`. This supplements OpenCue's host data with lab-specific naming.

## Lab Setup

Machine inventory is tracked in `opencue/uiw3d_machinelist/labs.xlsx`. The deployment scripts in `opencue/uiw3d_installers/` automate RQD installation on Windows lab machines.

## API Routes

| Route | Description |
|-------|-------------|
| `/api/jobs` | List/manage render jobs |
| `/api/shows` | List/manage shows |
| `/api/hosts` | List/manage render hosts |
| `/api/submit` | Submit new render jobs |
| `/api/users` | User management |

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **UI**: Tailwind CSS, shadcn/ui
- **Database**: SQLite (better-sqlite3) for local metadata
- **Auth**: Cookie-based sessions with bcrypt

## License

MIT
