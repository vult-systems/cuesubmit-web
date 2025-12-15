# CueWeb

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## CueWeb Launcher (Zig)

### Building

**Windows (native):**

```powershell
# Full build using batch script
cd launcher
.\build.bat

# Or manually:
cd ..
npm run build --webpack        # Build Next.js with webpack (required for Windows)
cd launcher
zig build -Doptimize=ReleaseSmall
# Then copy .next/standalone to zig-out/bin/app
```

**macOS (native):**

```bash
cd launcher
./bundle.sh --full             # Full build including Next.js

# Or just the Zig executable:
zig build -Doptimize=ReleaseSmall
```

**Cross-compilation (from macOS to Windows):**

```bash
cd launcher
zig build -Doptimize=ReleaseSmall -Dtarget=x86_64-windows-gnu
```

Output goes to `launcher/zig-out/bin/` as `cueweb-launcher` (macOS) or `cueweb-launcher.exe` (Windows).

### Platform Notes

- **macOS**: Uses native WebKit WebView for a true desktop app experience
- **Windows**: Opens the default browser (WebView2 integration planned for future)

### Running

```bash
# From the zig-out/bin directory (where cueweb-launcher.exe and app/ are located)
./cueweb-launcher --mode offline --port 3000

# Online mode (requires OpenCue REST Gateway)
./cueweb-launcher --mode online --api-base http://<gateway-host>:<port>
```

### Configuration

Config resolution order: CLI flags > config.json > env vars > defaults

**config.json example:**

```json
{
  "port": 3000,
  "mode": "offline",
  "nodePath": "node",
  "serverEntry": "./app/server.js",
  "openBrowser": true,
  "urlPath": "/",
  "logFile": "./logs/cueweb-launcher.log"
}
```
