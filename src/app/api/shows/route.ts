import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveShows, getShows, createShow, type Show } from "@/lib/opencue/gateway-client";

// Helper to extract nested array from gateway response
function extractShows(data: { shows: Show[] } | Show[]): Show[] {
  if (Array.isArray(data)) return data;
  return data.shows || [];
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("all") === "true";

    const result = includeInactive ? await getShows() : await getActiveShows();

    // Gateway returns { shows: { shows: [...] } }
    const shows = extractShows(result.shows);
    return NextResponse.json({ shows });
  } catch (error) {
    console.error("Failed to fetch shows:", error);
    return NextResponse.json(
      { error: "Failed to fetch shows" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only admins and instructors can create shows
    if (!hasPermission(user.role, "manage_shows")) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Show name is required" },
        { status: 400 }
      );
    }

    const result = await createShow(name);
    return NextResponse.json({ success: true, show: result.show });
  } catch (error) {
    console.error("Failed to create show:", error);
    return NextResponse.json(
      { error: "Failed to create show" },
      { status: 500 }
    );
  }
}
