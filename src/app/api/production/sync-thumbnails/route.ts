import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, type Role } from "@/lib/auth/permissions";
import {
  getAllActs,
  getAllShots,
  createAct,
  createShot,
  updateShot,
} from "@/lib/db/production";
import fs from "fs/promises";
import path from "path";

// Thumbnail directory on the render repo mount
const THUMBNAIL_DIR = path.join(
  process.env.RENDER_REPO_PATH || "/mnt/RenderOutputRepo",
  "Thesis_25-26/NLG/Editorial/Thumbnail"
);

// Pattern: act01_shot01_0000.png  or  act01_shot01.png
const FILENAME_RE = /^(act\d+)_(shot\d+)(?:_\d+)?\.(png|jpe?g)$/i;

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(user.role as Role, "manage_productions")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify the directory exists
    try {
      await fs.access(THUMBNAIL_DIR);
    } catch {
      return NextResponse.json(
        { error: `Thumbnail directory not found: ${THUMBNAIL_DIR}` },
        { status: 404 }
      );
    }

    // Read all files
    const entries = await fs.readdir(THUMBNAIL_DIR, { withFileTypes: true });
    const imageFiles = entries
      .filter((e) => e.isFile() && FILENAME_RE.test(e.name))
      .map((e) => {
        const match = e.name.match(FILENAME_RE)!;
        return {
          filename: e.name,
          actCode: match[1].toLowerCase(),
          shotCode: match[2].toLowerCase(),
        };
      });

    if (imageFiles.length === 0) {
      return NextResponse.json({
        message: "No matching thumbnails found",
        created: { acts: 0, shots: 0 },
        updated: { thumbnails: 0 },
      });
    }

    // Collect unique acts and shots needed
    const neededActs = new Map<string, string>(); // code → code
    const neededShots = new Map<string, { actCode: string; shotCode: string; filename: string }>();
    for (const f of imageFiles) {
      neededActs.set(f.actCode, f.actCode);
      const key = `${f.actCode}_${f.shotCode}`;
      // If multiple files for same shot (e.g. different frames), keep the latest (last alphabetically)
      if (!neededShots.has(key) || f.filename > neededShots.get(key)!.filename) {
        neededShots.set(key, f);
      }
    }

    // Get existing acts & shots
    const existingActs = getAllActs();
    const existingShots = getAllShots();
    const actCodeToId = new Map(existingActs.map((a) => [a.code, a.id]));
    const shotLookup = new Map(existingShots.map((s) => [`${s.act_code}_${s.code}`, s]));

    let actsCreated = 0;
    let shotsCreated = 0;
    let thumbnailsUpdated = 0;

    // Create missing acts
    const sortedActCodes = [...neededActs.keys()].sort();
    for (const actCode of sortedActCodes) {
      if (!actCodeToId.has(actCode)) {
        // Generate a name from the code (act01 → Act 1, act02 → Act 2, ...)
        const num = parseInt(actCode.replace("act", ""), 10);
        const name = `Act ${num}`;
        const act = createAct(actCode, name);
        actCodeToId.set(actCode, act.id);
        actsCreated++;
      }
    }

    // Create missing shots and update thumbnails
    for (const [key, info] of neededShots) {
      const actId = actCodeToId.get(info.actCode)!;
      const thumbnailPath = `repo:${info.filename}`;

      const existing = shotLookup.get(key);
      if (!existing) {
        // Create the shot
        const shot = createShot({ act_id: actId, code: info.shotCode });
        // Set thumbnail to point at the repo file
        updateShot(shot.id, { thumbnail: thumbnailPath });
        shotsCreated++;
        thumbnailsUpdated++;
      } else if (existing.thumbnail !== thumbnailPath) {
        // Update thumbnail if changed
        updateShot(existing.id, { thumbnail: thumbnailPath });
        thumbnailsUpdated++;
      }
    }

    return NextResponse.json({
      message: `Synced ${imageFiles.length} thumbnails`,
      created: { acts: actsCreated, shots: shotsCreated },
      updated: { thumbnails: thumbnailsUpdated },
      total: { files: imageFiles.length },
    });
  } catch (error) {
    console.error("Failed to sync thumbnails:", error);
    return NextResponse.json(
      { error: "Failed to sync thumbnails" },
      { status: 500 }
    );
  }
}

// GET: preview what would be synced (dry run)
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      await fs.access(THUMBNAIL_DIR);
    } catch {
      return NextResponse.json({
        available: false,
        directory: THUMBNAIL_DIR,
        files: [],
      });
    }

    const entries = await fs.readdir(THUMBNAIL_DIR, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && FILENAME_RE.test(e.name))
      .map((e) => e.name)
      .sort();

    return NextResponse.json({
      available: true,
      directory: THUMBNAIL_DIR,
      files,
      count: files.length,
    });
  } catch (error) {
    console.error("Failed to check thumbnails:", error);
    return NextResponse.json(
      { error: "Failed to check thumbnails" },
      { status: 500 }
    );
  }
}
