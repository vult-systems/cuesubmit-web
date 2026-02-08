import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getHosts } from "@/lib/opencue/gateway-client";

/**
 * GET /api/tags - Returns all unique tags across all hosts, sorted alphabetically.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await getHosts();
    const hostList = Array.isArray(result.hosts)
      ? result.hosts
      : (result.hosts as { hosts: Array<{ tags?: string[] }> }).hosts || [];

    // Collect all unique tags
    const tagSet = new Set<string>();
    for (const host of hostList) {
      if (host.tags) {
        for (const tag of host.tags) {
          if (tag) tagSet.add(tag);
        }
      }
    }

    const tags = Array.from(tagSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    return NextResponse.json({ tags });
  } catch (error) {
    console.error("Failed to fetch tags:", error);
    return NextResponse.json({ error: "Failed to fetch tags" }, { status: 500 });
  }
}
