import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import fs from "fs/promises";
import path from "path";

// Path translation between UNC and Linux mount
const RENDER_OUTPUT_LINUX = process.env.RENDER_REPO_PATH || "/mnt/RenderOutputRepo";
const RENDER_SOURCE_LINUX = process.env.RENDER_SOURCE_PATH || "/mnt/RenderSourceRepository";

const FILE_SERVER = process.env.FILE_SERVER_IP || 'localhost';
const RENDER_OUTPUT_UNC = `\\\\${FILE_SERVER}\\RenderOutputRepo`;
const RENDER_SOURCE_UNC = `\\\\${FILE_SERVER}\\RenderSourceRepository`;

const PATH_MAPPINGS = [
  { unc: RENDER_OUTPUT_UNC, linux: RENDER_OUTPUT_LINUX },
  { unc: RENDER_SOURCE_UNC, linux: RENDER_SOURCE_LINUX },
];

// Convert UNC path to Linux path for filesystem access
function uncToLinux(uncPath: string): string {
  const decoded = decodeURIComponent(uncPath);
  const normalized = decoded.replace(/\\/g, "/").replace(/\/+$/, "");

  for (const mapping of PATH_MAPPINGS) {
    const uncNorm = mapping.unc.replace(/\\/g, "/");
    if (normalized.startsWith(uncNorm)) {
      return normalized.replace(uncNorm, mapping.linux);
    }
    const slashUncNorm = "//" + uncNorm.replace(/^\/+/, "");
    if (normalized.startsWith(slashUncNorm)) {
      return normalized.replace(slashUncNorm, mapping.linux);
    }
  }

  // Might already be a linux path
  for (const mapping of PATH_MAPPINGS) {
    if (normalized.startsWith(mapping.linux)) {
      return normalized;
    }
  }
  return normalized;
}

function isAllowedPath(linuxPath: string): boolean {
  const normalized = linuxPath.replace(/\/+$/, "");
  return PATH_MAPPINGS.some(m => normalized.startsWith(m.linux.replace(/\/+$/, "")));
}

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

// Supported browser-viewable image extensions
const VIEWABLE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get("path");

    if (!filePath) {
      return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
    }

    const linuxPath = uncToLinux(filePath);

    // Security: Ensure path is within allowed render paths
    if (!isAllowedPath(linuxPath)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const ext = path.extname(linuxPath).toLowerCase();

    if (!VIEWABLE_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `Unsupported format: ${ext}. Only PNG, JPG, GIF, WebP, BMP are viewable.` },
        { status: 415 }
      );
    }

    // Check file exists
    try {
      await fs.access(linuxPath);
    } catch {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const fileBuffer = await fs.readFile(linuxPath);
    const mimeType = MIME_TYPES[ext] || "application/octet-stream";

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": fileBuffer.length.toString(),
        "Cache-Control": "public, max-age=30", // Short cache since renders update
      },
    });
  } catch (error) {
    console.error("Preview error:", error);
    return NextResponse.json(
      { error: "Failed to load preview" },
      { status: 500 }
    );
  }
}
