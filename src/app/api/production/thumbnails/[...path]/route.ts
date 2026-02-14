import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import fs from "fs/promises";
import path from "path";

const DATA_DIR = process.env.DATABASE_PATH
  ? path.dirname(process.env.DATABASE_PATH)
  : path.join(process.cwd(), "data");
const THUMBNAILS_DIR = path.join(DATA_DIR, "thumbnails");

// Render repo thumbnail directory (for repo:-prefixed paths)
const REPO_THUMBNAIL_DIR = path.join(
  process.env.RENDER_REPO_PATH || "/mnt/RenderOutputRepo",
  "Thesis_25-26/NLG/Editorial/Thumbnail"
);

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { path: segments } = await params;
    if (!segments || segments.length === 0) {
      return NextResponse.json({ error: "Path required" }, { status: 400 });
    }

    // Security: disallow path traversal
    const requestedPath = segments.join("/");
    if (requestedPath.includes("..") || requestedPath.includes("~")) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    let filePath: string;
    let baseDir: string;

    // Handle repo: prefix — serve from render repo mount
    if (segments[0] === "repo:" || requestedPath.startsWith("repo:")) {
      // Path stored as "repo:filename.png" → segments = ["repo:filename.png"]
      // or catch-all split might give ["repo:", "filename.png"]
      let repoFilename: string;
      if (segments[0].startsWith("repo:") && segments[0].length > 5) {
        repoFilename = segments[0].substring(5);
      } else {
        repoFilename = segments.slice(1).join("/");
      }
      if (!repoFilename) {
        return NextResponse.json({ error: "Filename required" }, { status: 400 });
      }
      baseDir = REPO_THUMBNAIL_DIR;
      filePath = path.join(REPO_THUMBNAIL_DIR, repoFilename);
    } else {
      // Standard uploaded thumbnails from data/thumbnails/
      baseDir = THUMBNAILS_DIR;
      filePath = path.join(THUMBNAILS_DIR, ...segments);
    }

    // Ensure resolved path is within the allowed directory
    const resolved = path.resolve(filePath);
    const resolvedBase = path.resolve(baseDir);
    if (!resolved.startsWith(resolvedBase)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 403 });
    }

    // Check file exists
    try {
      await fs.access(filePath);
    } catch {
      return NextResponse.json({ error: "Thumbnail not found" }, { status: 404 });
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || "application/octet-stream";
    const fileBuffer = await fs.readFile(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": fileBuffer.length.toString(),
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("Failed to serve thumbnail:", error);
    return NextResponse.json({ error: "Failed to serve thumbnail" }, { status: 500 });
  }
}
