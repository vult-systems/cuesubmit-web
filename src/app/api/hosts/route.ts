import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getHosts, type Host } from "@/lib/opencue/gateway-client";

// Helper to extract nested array from gateway response
function extractHosts(data: { hosts: Host[] } | Host[]): Host[] {
  if (Array.isArray(data)) return data;
  return data.hosts || [];
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await getHosts();

    // Gateway returns { hosts: { hosts: [...] } }
    const hosts = extractHosts(result.hosts);
    return NextResponse.json({ hosts });
  } catch (error) {
    console.error("Failed to fetch hosts:", error);
    return NextResponse.json(
      { error: "Failed to fetch hosts" },
      { status: 500 }
    );
  }
}
