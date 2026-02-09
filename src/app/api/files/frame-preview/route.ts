import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import fs from "fs/promises";
import path from "path";

// Path translation between UNC and Linux mount
const RENDER_OUTPUT_LINUX = process.env.RENDER_REPO_PATH || "/mnt/RenderOutputRepo";
const RENDER_SOURCE_LINUX = process.env.RENDER_SOURCE_PATH || "/mnt/RenderSourceRepository";

const RENDER_OUTPUT_UNC = String.raw`\\REDACTED_IP\RenderOutputRepo`;
const RENDER_SOURCE_UNC = String.raw`\\REDACTED_IP\RenderSourceRepository`;

const PATH_MAPPINGS = [
  { unc: RENDER_OUTPUT_UNC, linux: RENDER_OUTPUT_LINUX },
  { unc: RENDER_SOURCE_UNC, linux: RENDER_SOURCE_LINUX },
];

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const VIEWABLE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);

// Convert UNC path to Linux path for Docker filesystem access
function uncToLinux(uncPath: string): string {
  const normalized = uncPath.replace(/\\/g, "/").replace(/\/+$/, "");
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
  return normalized;
}

// Security check: is this path within an allowed render directory?
function isAllowedPath(inputPath: string): boolean {
  const normalized = inputPath.replace(/\\/g, "/").replace(/\/+$/, "");
  // Check UNC paths
  for (const mapping of PATH_MAPPINGS) {
    const uncNorm = mapping.unc.replace(/\\/g, "/");
    if (normalized.startsWith(uncNorm)) return true;
    const slashNorm = "//" + uncNorm.replace(/^\/+/, "");
    if (normalized.startsWith(slashNorm)) return true;
    if (normalized.startsWith(mapping.linux)) return true;
  }
  return false;
}

// Try to access a directory, returning the first working path variant
async function resolveDir(inputPath: string): Promise<string | null> {
  const decoded = decodeURIComponent(inputPath);

  // Try Linux mount path first (Docker environment)
  const linuxPath = uncToLinux(decoded);
  try {
    await fs.access(linuxPath);
    return linuxPath;
  } catch {
    // Not available (likely local Windows dev)
  }

  // Try the original path as-is (works for UNC paths on Windows)
  const originalNorm = decoded.replace(/\//g, "\\");
  try {
    await fs.access(originalNorm);
    return originalNorm;
  } catch {
    // Not available
  }

  // Try forward-slash version
  const forwardSlash = decoded.replace(/\\/g, "/");
  try {
    await fs.access(forwardSlash);
    return forwardSlash;
  } catch {
    // Not available
  }

  return null;
}

// Scan a directory for image files matching a frame number
async function findFrameImage(
  dirPath: string,
  frameNumber: number
): Promise<{ filePath: string; ext: string } | { error: string } | null> {
  const padded4 = String(frameNumber).padStart(4, "0");
  const padded3 = String(frameNumber).padStart(3, "0");
  const padded5 = String(frameNumber).padStart(5, "0");
  const rawNum = String(frameNumber);
  const paddings = [padded4, padded3, padded5, rawNum];

  function matchesFrame(name: string): boolean {
    for (const p of paddings) {
      if (name.includes(`.${p}.`) || name.includes(`_${p}.`)) return true;
    }
    return false;
  }

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    // First pass: look for viewable image files
    for (const entry of entries) {
      if (entry.isDirectory()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!VIEWABLE_EXTENSIONS.has(ext)) continue;
      if (matchesFrame(entry.name)) {
        return { filePath: path.join(dirPath, entry.name), ext };
      }
    }

    // Second pass: check for non-viewable image files (EXR, TIFF, etc.)
    for (const entry of entries) {
      if (entry.isDirectory()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (VIEWABLE_EXTENSIONS.has(ext)) continue;
      if ([".exr", ".tif", ".tiff", ".hdr", ".dpx"].includes(ext) && matchesFrame(entry.name)) {
        return { error: `Rendered as ${ext.toUpperCase().replace(".", "")} — not viewable in browser` };
      }
    }

    // Third pass: check subdirectories (Arnold often puts outputs in images/ subfolder)
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const subDir = path.join(dirPath, entry.name);
      const subResult = await findFrameImageFlat(subDir, paddings);
      if (subResult) return subResult;
    }

    return null;
  } catch {
    return null;
  }
}

// Flat scan of a single directory (no recursion) for frame images
async function findFrameImageFlat(
  dirPath: string,
  paddings: string[]
): Promise<{ filePath: string; ext: string } | { error: string } | null> {
  function matchesFrame(name: string): boolean {
    for (const p of paddings) {
      if (name.includes(`.${p}.`) || name.includes(`_${p}.`)) return true;
    }
    return false;
  }

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (VIEWABLE_EXTENSIONS.has(ext) && matchesFrame(entry.name)) {
        return { filePath: path.join(dirPath, entry.name), ext };
      }
    }

    for (const entry of entries) {
      if (entry.isDirectory()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if ([".exr", ".tif", ".tiff", ".hdr", ".dpx"].includes(ext) && matchesFrame(entry.name)) {
        return { error: `Rendered as ${ext.toUpperCase().replace(".", "")} — not viewable in browser` };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * GET /api/files/frame-preview?dir=<outputDir>&frame=<number>
 *
 * Discovers and serves a rendered frame image from the output directory.
 * Handles path resolution for both Docker (Linux mounts) and Windows (UNC paths).
 * Scans the directory and its immediate subdirectories for matching frame files.
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dir = searchParams.get("dir");
    const frame = searchParams.get("frame");

    if (!dir || !frame) {
      return NextResponse.json(
        { error: "Missing dir and/or frame parameters" },
        { status: 400 }
      );
    }

    // Security check
    if (!isAllowedPath(dir)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const frameNumber = parseInt(frame, 10);
    if (isNaN(frameNumber)) {
      return NextResponse.json({ error: "Invalid frame number" }, { status: 400 });
    }

    // Resolve the directory to a working filesystem path
    const resolvedDir = await resolveDir(dir);
    if (!resolvedDir) {
      return NextResponse.json(
        { error: "Output directory not accessible", detail: "Could not access the render output directory from this server" },
        { status: 404 }
      );
    }

    // Find the frame image
    const result = await findFrameImage(resolvedDir, frameNumber);

    if (!result) {
      return NextResponse.json(
        { error: "No rendered image found for this frame" },
        { status: 404 }
      );
    }

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 415 });
    }

    // Read and serve the image
    const fileBuffer = await fs.readFile(result.filePath);
    const mimeType = MIME_TYPES[result.ext] || "application/octet-stream";

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": fileBuffer.length.toString(),
        "Cache-Control": "public, max-age=30",
      },
    });
  } catch (error) {
    console.error("Frame preview error:", error);
    return NextResponse.json(
      { error: "Failed to load preview" },
      { status: 500 }
    );
  }
}
