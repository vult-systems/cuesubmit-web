import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getShowJobHistoryStats } from "@/lib/opencue/database";
import { config } from "@/lib/config";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Handle offline mode - return empty stats
    if (config.mode === "offline") {
      return NextResponse.json({ jobCount: 0, subscriptionCount: 0 });
    }

    // Online mode - fetch from database
    const stats = await getShowJobHistoryStats(id);
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Failed to fetch job history stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch job history stats", jobCount: 0, subscriptionCount: 0 },
      { status: 500 }
    );
  }
}
