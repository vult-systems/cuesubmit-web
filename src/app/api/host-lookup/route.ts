import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getHosts } from "@/lib/opencue/gateway-client";

// Extract display ID from tags (e.g., "AD415-05" from ["general", "AD415", "AD415-05"])
function getDisplayIdFromTags(tags: string[]): string | null {
  if (!tags || tags.length === 0) return null;
  const match = tags.find(t => /^[A-Za-z]+\d+-\w+$/.test(t));
  return match?.toUpperCase() || null;
}

/**
 * Returns a lightweight map of host IP/name → display ID.
 * Used by the job detail drawer to resolve frame lastResource IPs
 * to human-readable machine names like AD405-01.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hostsResult = await getHosts();

    // Extract hosts array from gateway response
    let hosts: { id: string; name: string; tags?: string[]; ipAddress?: string }[];
    const raw = hostsResult.hosts;
    if (Array.isArray(raw)) {
      hosts = raw;
    } else if (raw && typeof raw === "object" && "hosts" in raw) {
      hosts = (raw as { hosts: typeof hosts }).hosts || [];
    } else {
      hosts = [];
    }

    // Build lookup map: IP → display_id derived from tags
    const lookup: Record<string, string> = {};
    for (const host of hosts) {
      const displayId = getDisplayIdFromTags(host.tags || []);
      if (displayId) {
        if (host.name) lookup[host.name] = displayId;
        if (host.ipAddress) lookup[host.ipAddress] = displayId;
      }
    }

    return NextResponse.json({ lookup });
  } catch (error) {
    console.error("Failed to build host lookup:", error);
    return NextResponse.json(
      { error: "Failed to build host lookup" },
      { status: 500 }
    );
  }
}
