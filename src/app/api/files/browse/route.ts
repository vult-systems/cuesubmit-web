import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import fs from "fs/promises";
import path from "path";

// Path translation between UNC and Linux mount
const LINUX_PATH = process.env.RENDER_REPO_PATH || "/mnt/RenderOutputRepo";
const UNC_PATH = process.env.RENDER_REPO_UNC || "\\\\REDACTED_IP\\RenderOutputRepo";

// Convert UNC path to Linux path for filesystem access
function uncToLinux(uncPath: string): string {
  // Decode URI components first
  let decoded = decodeURIComponent(uncPath);
  
  // Normalize backslashes and remove trailing slashes
  const normalized = decoded.replace(/\\/g, "/").replace(/\/+$/, "");
  const uncNormalized = UNC_PATH.replace(/\\/g, "/");
  
  if (normalized.startsWith(uncNormalized)) {
    return normalized.replace(uncNormalized, LINUX_PATH);
  }
  // Already a Linux path
  if (normalized.startsWith(LINUX_PATH)) {
    return normalized;
  }
  // Handle case where path starts with just the share name without full UNC
  if (normalized.startsWith("//REDACTED_IP/RenderOutputRepo")) {
    return normalized.replace("//REDACTED_IP/RenderOutputRepo", LINUX_PATH);
  }
  return normalized;
}

// Convert Linux path back to UNC for display
function linuxToUnc(linuxPath: string): string {
  if (linuxPath.startsWith(LINUX_PATH)) {
    return linuxPath.replace(LINUX_PATH, UNC_PATH).replace(/\//g, "\\");
  }
  return linuxPath;
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const requestedPath = searchParams.get("path") || UNC_PATH;

    // Convert to Linux path for filesystem access
    const linuxPath = uncToLinux(requestedPath);

    // Security: Ensure path is within allowed base path
    // Also normalize the base path comparison
    const normalizedLinux = linuxPath.replace(/\/+$/, "");
    const normalizedBase = LINUX_PATH.replace(/\/+$/, "");
    if (!normalizedLinux.startsWith(normalizedBase)) {
      console.error("Access denied - path:", requestedPath, "-> linux:", linuxPath);
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

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

    // Calculate parent path
    const parentLinuxPath = linuxPath !== LINUX_PATH ? path.posix.dirname(linuxPath) : null;
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
