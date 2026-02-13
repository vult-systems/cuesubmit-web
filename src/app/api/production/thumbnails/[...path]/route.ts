import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import fs from "fs/promises";
import path from "path";

const DATA_DIR = process.env.DATABASE_PATH
  ? path.dirname(process.env.DATABASE_PATH)
  : path.join(process.cwd(), "data");
const THUMBNAILS_DIR = path.join(DATA_DIR, "thumbnails");

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

    const filePath = path.join(THUMBNAILS_DIR, ...segments);

    // Ensure resolved path is within thumbnails directory
    const resolved = path.resolve(filePath);
    const resolvedBase = path.resolve(THUMBNAILS_DIR);
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
