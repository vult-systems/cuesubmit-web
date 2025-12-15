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

Build (macOS host):

```bash
cd launcher
zig build -Doptimize=ReleaseSmall                    # macOS universal via Rosetta/arm64 host
zig build -Doptimize=ReleaseSmall -Dtarget=x86_64-windows-gnu   # Windows 10/11 exe
# optionally for ARM Windows
zig build -Doptimize=ReleaseSmall -Dtarget=aarch64-windows-gnu
```

Output goes to `launcher/zig-out/bin/` as `cueweb-launcher` (macOS) or `cueweb-launcher.exe` (Windows).
For Windows cross-compiles, ensure Zig can find the `mingw` libs that ship with Zig (works out-of-box with official Zig downloads).

Run (from release bundle root):

```bash
./cueweb-launcher --mode offline --port 3000
# or, online
./cueweb-launcher --mode online --api-base http://<gateway-host>:<port>
```

Config resolution: CLI flags > config.json > env vars > defaults. The launcher spawns the Next standalone server, waits for readiness, and opens the browser unless `--no-browser` is set. Logs are written to `./logs/cueweb-launcher.log`.
