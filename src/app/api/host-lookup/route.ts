import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getHosts } from "@/lib/opencue/gateway-client";
import { getAllHostMetadata } from "@/lib/db";
import dns from "dns/promises";

// DNS reverse lookup cache: IP → { hostname, timestamp }
const dnsCache = new Map<string, { hostname: string | null; ts: number }>();
const DNS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function looksLikeIp(name: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(name);
}

async function resolveHostname(ip: string): Promise<string | null> {
  const cached = dnsCache.get(ip);
  if (cached && Date.now() - cached.ts < DNS_CACHE_TTL) {
    return cached.hostname;
  }
  try {
    const hostnames = await dns.reverse(ip);
    const hostname = hostnames[0]?.split('.')[0] || null;
    dnsCache.set(ip, { hostname, ts: Date.now() });
    return hostname;
  } catch {
    dnsCache.set(ip, { hostname: null, ts: Date.now() });
    return null;
  }
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

    // Fetch OpenCue hosts and SQLite metadata in parallel
    const [hostsResult, metadata] = await Promise.all([
      getHosts(),
      getAllHostMetadata(),
    ]);

    // Extract hosts array from gateway response
    let hosts: { id: string; name: string; ipAddress?: string }[];
    const raw = hostsResult.hosts;
    if (Array.isArray(raw)) {
      hosts = raw;
    } else if (raw && typeof raw === "object" && "hosts" in raw) {
      hosts = (raw as { hosts: { id: string; name: string; ipAddress?: string }[] }).hosts || [];
    } else {
      hosts = [];
    }

    // Build metadata map: hostname → display_id
    const metaMap: Record<string, string> = {};
    for (const m of metadata) {
      if (m.display_id) {
        metaMap[m.hostname] = m.display_id.trim();
      }
    }

    // Build lookup map: IP and hostname → display_id
    // Resolve hostnames from IPs via reverse DNS to match against metadata
    const lookup: Record<string, string> = {};
    await Promise.all(
      hosts.map(async (host) => {
        let hostname: string | null = null;
        if (looksLikeIp(host.name)) {
          hostname = await resolveHostname(host.name);
        } else {
          hostname = host.name;
        }

        const displayId = hostname ? metaMap[hostname] : undefined;
        if (displayId) {
          if (host.name) lookup[host.name] = displayId;
          if (host.ipAddress) lookup[host.ipAddress] = displayId;
          if (hostname) lookup[hostname] = displayId;
        }
      })
    );

    return NextResponse.json({ lookup });
  } catch (error) {
    console.error("Failed to build host lookup:", error);
    return NextResponse.json(
      { error: "Failed to build host lookup" },
      { status: 500 }
    );
  }
}
