import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveShows, getShows, createShow, type Show } from "@/lib/opencue/gateway-client";
import { config } from "@/lib/config";
import { SHOWS } from "@/lib/mock-data";

// Helper to extract nested array from gateway response
function extractShows(data: { shows: Show[] } | Show[]): Show[] {
  if (Array.isArray(data)) return data;
  return data.shows || [];
}

// In-memory store for offline mode shows - initialized from centralized mock data
let offlineShows: Show[] = SHOWS.map(s => ({
  id: s.id,
  name: s.name,
  tag: s.tag,
  description: s.description,
  active: s.active,
  defaultMinCores: s.defaultMinCores,
  defaultMaxCores: s.defaultMaxCores,
  bookingEnabled: s.bookingEnabled,
  semester: s.semester
}));

// Export for use by other routes
export function getOfflineShows(): Show[] {
  return offlineShows;
}

export function setOfflineShows(shows: Show[]): void {
  offlineShows = shows;
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Return mock data in offline mode
    if (config.mode === "offline") {
      const { searchParams } = new URL(request.url);
      const includeInactive = searchParams.get("all") === "true";
      const filtered = includeInactive ? offlineShows : offlineShows.filter(s => s.active);
      return NextResponse.json({ shows: filtered });
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

    // Only admins and managers can create shows
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

    // Handle offline mode
    if (config.mode === "offline") {
      // Check for duplicate name
      if (offlineShows.some(s => s.name.toLowerCase() === name.trim().toLowerCase())) {
        return NextResponse.json(
          { error: "A show with this name already exists" },
          { status: 400 }
        );
      }

      const newShow: Show = {
        id: `show-${Date.now()}`,
        name: name.trim(),
        active: true,
        defaultMinCores: 1,
        defaultMaxCores: 4
      };
      offlineShows.push(newShow);
      return NextResponse.json({ success: true, show: newShow });
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
