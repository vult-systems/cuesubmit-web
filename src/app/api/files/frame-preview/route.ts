import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import crypto from "crypto";
import os from "os";

const execFileAsync = promisify(execFile);

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

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const VIEWABLE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);
const CONVERTIBLE_EXTENSIONS = new Set([".exr", ".tif", ".tiff", ".hdr", ".dpx"]);
const PREVIEW_CACHE_DIR = path.join(os.tmpdir(), "frame-preview-cache");

// Convert HDR/non-browser image formats to JPEG using ffmpeg
async function convertToPreviewable(filePath: string): Promise<string> {
  await fs.mkdir(PREVIEW_CACHE_DIR, { recursive: true });
  const stat = await fs.stat(filePath);
  const hash = crypto.createHash("sha256").update(`${filePath}:${stat.mtimeMs}`).digest("hex");
  const cachedPath = path.join(PREVIEW_CACHE_DIR, `${hash}.jpg`);

  // Return cached version if it exists
  try {
    await fs.access(cachedPath);
    return cachedPath;
  } catch { /* not cached yet */ }

  // Convert with ffmpeg — apply_trc maps HDR to sRGB for viewable output
  await execFileAsync("ffmpeg", [
    "-y",
    "-apply_trc", "iec61966_2_1",
    "-i", filePath,
    "-vframes", "1",
    "-q:v", "2",
    cachedPath,
  ]);

  return cachedPath;
}

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

    // Second pass: check for convertible image files (EXR, TIFF, etc.)
    for (const entry of entries) {
      if (entry.isDirectory()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (VIEWABLE_EXTENSIONS.has(ext)) continue;
      if (CONVERTIBLE_EXTENSIONS.has(ext) && matchesFrame(entry.name)) {
        return { filePath: path.join(dirPath, entry.name), ext };
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
      if (CONVERTIBLE_EXTENSIONS.has(ext) && matchesFrame(entry.name)) {
        return { filePath: path.join(dirPath, entry.name), ext };
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

    // Convert non-browser formats (EXR, TIFF, etc.) to JPEG
    let servePath = result.filePath;
    let serveMime = MIME_TYPES[result.ext] || "application/octet-stream";

    if (CONVERTIBLE_EXTENSIONS.has(result.ext)) {
      try {
        servePath = await convertToPreviewable(result.filePath);
        serveMime = "image/jpeg";
      } catch (err) {
        console.error("EXR conversion error:", err);
        return NextResponse.json(
          { error: "Failed to convert image for preview" },
          { status: 500 }
        );
      }
    }

    // Read and serve the image
    const fileBuffer = await fs.readFile(servePath);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": serveMime,
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
