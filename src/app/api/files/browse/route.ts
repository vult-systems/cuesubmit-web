import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import fs from "fs/promises";
import path from "path";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dirPath = searchParams.get("path") || "\\\\REDACTED_IP\\RenderOutputRepo";

    // Security: Ensure path starts with allowed base path
    const basePath = "\\\\REDACTED_IP\\RenderOutputRepo";
    if (!dirPath.startsWith(basePath) && dirPath !== basePath) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    const items = entries
      .filter(entry => !entry.name.startsWith(".")) // Hide hidden files
      .map(entry => ({
        name: entry.name,
        path: path.join(dirPath, entry.name),
        isDirectory: entry.isDirectory(),
        // Get extension for files
        extension: entry.isFile() ? path.extname(entry.name).toLowerCase() : null,
      }))
      .sort((a, b) => {
        // Directories first, then files
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

    return NextResponse.json({
      currentPath: dirPath,
      parentPath: dirPath !== basePath ? path.dirname(dirPath) : null,
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
