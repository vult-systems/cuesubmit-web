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

// All allowed path mappings
const PATH_MAPPINGS = [
  { unc: RENDER_OUTPUT_UNC, linux: RENDER_OUTPUT_LINUX },
  { unc: RENDER_SOURCE_UNC, linux: RENDER_SOURCE_LINUX },
];

// Convert UNC path to Linux path for filesystem access
function uncToLinux(uncPath: string): string {
  const decoded = decodeURIComponent(uncPath);
  // Normalize to forward slashes and strip trailing slash
  let normalized = decoded.replace(/\\/g, "/").replace(/\/+$/, "");

  // Replace any IP/hostname in the UNC path with the server's FILE_SERVER
  // so client and server don't need to agree on the exact hostname
  normalized = normalized.replace(/^\/\/[^/]+\//, `//${FILE_SERVER}/`);

  for (const mapping of PATH_MAPPINGS) {
    const uncNorm = mapping.unc.replace(/\\/g, "/");
    if (normalized.startsWith(uncNorm)) {
      return normalized.replace(uncNorm, mapping.linux);
    }
    // Handle //ip/share format
    const slashUncNorm = "//" + uncNorm.replace(/^\/+/, "");
    if (normalized.startsWith(slashUncNorm)) {
      return normalized.replace(slashUncNorm, mapping.linux);
    }
  }

  // Already a Linux path
  for (const mapping of PATH_MAPPINGS) {
    if (normalized.startsWith(mapping.linux)) {
      return normalized;
    }
  }
  return normalized;
}

// Convert Linux path back to UNC for display
function linuxToUnc(linuxPath: string): string {
  for (const mapping of PATH_MAPPINGS) {
    if (linuxPath.startsWith(mapping.linux)) {
      return linuxPath.replace(mapping.linux, mapping.unc).replace(/\//g, "\\");
    }
  }
  return linuxPath;
}

// Check if a linux path is within any allowed base path
function isAllowedPath(linuxPath: string): boolean {
  const normalized = linuxPath.replace(/\/+$/, "");
  return PATH_MAPPINGS.some(m => normalized.startsWith(m.linux.replace(/\/+$/, "")));
}

// Get the base linux path for a given linux path
function getBasePath(linuxPath: string): string {
  for (const mapping of PATH_MAPPINGS) {
    if (linuxPath.startsWith(mapping.linux)) {
      return mapping.linux;
    }
  }
  return RENDER_OUTPUT_LINUX;
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const requestedPath = searchParams.get("path") || RENDER_OUTPUT_UNC;

    // Convert to Linux path for filesystem access
    const linuxPath = uncToLinux(requestedPath);

    // Security: Ensure path is within an allowed base path
    if (!isAllowedPath(linuxPath)) {
      console.error("Access denied - path:", requestedPath, "-> linux:", linuxPath);
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const basePath = getBasePath(linuxPath);

    const entries = await fs.readdir(linuxPath, { withFileTypes: true });
    
    const items = entries
      .filter(entry => !entry.name.startsWith(".")) // Hide hidden files
      .map(entry => {
        const itemLinuxPath = path.posix.join(linuxPath, entry.name);
        return {
          name: entry.name,
          path: linuxToUnc(itemLinuxPath), // Return UNC path for display
          isDirectory: entry.isDirectory(),
          extension: entry.isFile() ? path.extname(entry.name).toLowerCase() : null,
        };
      })
      .sort((a, b) => {
        // Directories first, then files
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

    // Calculate parent path (don't go above the base path)
    const parentLinuxPath = linuxPath !== basePath ? path.posix.dirname(linuxPath) : null;
    const parentUncPath = parentLinuxPath ? linuxToUnc(parentLinuxPath) : null;

    return NextResponse.json({
      currentPath: linuxToUnc(linuxPath),
      parentPath: parentUncPath,
      items,
    });
  } catch (error) {
    console.error("Failed to browse directory:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to browse directory" },
      { status: 500 }
    );
  }
}
