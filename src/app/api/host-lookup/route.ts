import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getHosts } from "@/lib/opencue/gateway-client";
import { getAllHostMetadata } from "@/lib/db";

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

    // Fetch OpenCue hosts and SQLite metadata in parallel
    const [hostsResult, metadata] = await Promise.all([
      getHosts(),
      getAllHostMetadata(),
    ]);

    // Extract hosts array from gateway response
    // Gateway may return { hosts: Host[] } or { hosts: { hosts: Host[] } }
    let hosts: { id: string; name: string; ipAddress?: string }[];
    const raw = hostsResult.hosts;
    if (Array.isArray(raw)) {
      hosts = raw;
    } else if (raw && typeof raw === "object" && "hosts" in raw) {
      hosts = (raw as { hosts: { id: string; name: string; ipAddress?: string }[] }).hosts || [];
    } else {
      hosts = [];
    }

    // Build metadata map: opencue_host_id → display_id
    const metaMap: Record<string, string> = {};
    for (const m of metadata) {
      if (m.display_id) {
        metaMap[m.opencue_host_id] = m.display_id.trim();
      }
    }

    // Build lookup map: IP and hostname → display_id
    const lookup: Record<string, string> = {};
    for (const host of hosts) {
      const displayId = metaMap[host.id];
      if (displayId) {
        // Map both the hostname and IP to the display ID
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
