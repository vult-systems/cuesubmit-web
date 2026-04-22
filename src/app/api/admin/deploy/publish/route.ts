import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import fs from "fs/promises";
import path from "path";

/**
 * The deploy payload files are bundled into the Docker image at /app/deploy-payload/
 * during build (see Dockerfile). This allows the production server to push the
 * latest files to the Samba share without needing manual dev-machine access.
 *
 * The share is mounted read-write at DEPLOY_SHARE_PATH (docker-compose.yml).
 *
 * If publish fails with EACCES, run on the server:
 *   sudo chown -R 1001 /opt/perforce/deadlineRenderSource/Utility/OpenCue_Deploy
 */

const PAYLOAD_DIR = process.env.DEPLOY_PAYLOAD_DIR ?? "/app/deploy-payload";
const SHARE_PATH = process.env.DEPLOY_SHARE_PATH ?? "/mnt/DeployShare";

// Mirrors the file mapping in scripts/publish-to-share.ps1
// [src relative to PAYLOAD_DIR, dst relative to SHARE_PATH]
const FILE_MAP: [string, string][] = [
  ["UPDATE.bat",                           "UPDATE.bat"],
  ["DEPLOY-AS-ADMIN.bat",                  "DEPLOY-AS-ADMIN.bat"],
  ["DIAGNOSE.bat",                         "DIAGNOSE.bat"],
  ["LaunchCueNimby.bat",                   "LaunchCueNimby.bat"],
  ["post-update.ps1",                      "post-update.ps1"],
  ["TEST-CUEBOT.py",                       "TEST-CUEBOT.py"],
  ["source/config/cuenimby.json",          "source/config/cuenimby.json"],
  ["source/config/opencue.yaml",           "source/config/opencue.yaml"],
  ["source/config/StartCueNimby.vbs",      "source/config/StartCueNimby.vbs"],
  ["source/config/rqd.conf",               "source/config/rqd.conf"],
  ["source/rqd/rqnimby.py",               "source/rqd/rqnimby.py"],
  ["source/rqd/rqconstants.py",           "source/rqd/rqconstants.py"],
  ["source/cuenimby/activity.py",          "source/cuenimby/activity.py"],
  ["source/cuenimby/config.py",            "source/cuenimby/config.py"],
  ["source/cuenimby/monitor.py",           "source/cuenimby/monitor.py"],
  ["source/cuenimby/notifier.py",          "source/cuenimby/notifier.py"],
  ["source/cuenimby/tray.py",              "source/cuenimby/tray.py"],
  ["source/cuenimby/__main__.py",          "source/cuenimby/__main__.py"],
];

/**
 * GET /api/admin/deploy/publish
 * Returns whether the deploy share is accessible and when it was last published.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user.role, "manage_hosts")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const sentinelPath = path.join(SHARE_PATH, "UPDATE.bat");
    const stat = await fs.stat(sentinelPath);
    let version: string | undefined;
    try {
      const raw = await fs.readFile(path.join(SHARE_PATH, "version.json"), "utf-8");
      const parsed = JSON.parse(raw) as { version?: string };
      version = parsed.version;
    } catch { /* version.json may not exist yet */ }
    return NextResponse.json({
      accessible: true,
      lastPublished: Math.floor(stat.mtimeMs / 1000),
      version,
    });
  } catch {
    return NextResponse.json({ accessible: false, lastPublished: null });
  }
}

/**
 * POST /api/admin/deploy/publish
 * Copies bundled deploy-payload files to the mounted deploy share.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user.role, "manage_hosts")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results: { file: string; ok: boolean; error?: string }[] = [];

  for (const [src, dst] of FILE_MAP) {
    const srcPath = path.join(PAYLOAD_DIR, src);
    const dstPath = path.join(SHARE_PATH, dst);
    try {
      await fs.mkdir(path.dirname(dstPath), { recursive: true });
      await fs.copyFile(srcPath, dstPath);
      results.push({ file: dst, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isPermission = message.includes("EACCES") || message.includes("EPERM");
      results.push({
        file: dst,
        ok: false,
        error: isPermission
          ? `Permission denied — run on server: sudo chown -R 1001 /opt/perforce/deadlineRenderSource/Utility/OpenCue_Deploy`
          : message,
      });
    }
  }

  const failed = results.filter((r) => !r.ok);
  const succeeded = results.filter((r) => r.ok);
  const timestamp = Math.floor(Date.now() / 1000);

  // Write version.json to share — hosts can read this to know what build is deployed
  const d = new Date(timestamp * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const version = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  try {
    await fs.writeFile(
      path.join(SHARE_PATH, "version.json"),
      JSON.stringify({ version, publishedAt: timestamp, publishedBy: user.username }),
      "utf-8"
    );
  } catch { /* non-fatal: version tracking is best-effort */ }

  return NextResponse.json(
    {
      ok: failed.length === 0,
      published: succeeded.length,
      failed: failed.length,
      results,
      timestamp,
      version,
    },
    { status: failed.length > 0 && succeeded.length === 0 ? 500 : 200 }
  );
}
