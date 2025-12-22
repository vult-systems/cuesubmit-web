import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveShows, getShows, createShow, type Show } from "@/lib/opencue/gateway-client";
import { getAllShowMetadata, setShowSemester } from "@/lib/opencue/database";
import { config } from "@/lib/config";
import { getOfflineShows, setOfflineShows } from "@/lib/offline-shows";

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

    // Return mock data in offline mode
    if (config.mode === "offline") {
      const { searchParams } = new URL(request.url);
      const includeInactive = searchParams.get("all") === "true";
      const offlineShows = getOfflineShows();
      const filtered = includeInactive ? offlineShows : offlineShows.filter(s => s.active);
      return NextResponse.json({ shows: filtered });
    }

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("all") === "true";

    const result = includeInactive ? await getShows() : await getActiveShows();

    // Gateway returns { shows: { shows: [...] } }
    const shows = extractShows(result.shows);
    
    // Enrich with semester metadata from local database
    try {
      const metadata = await getAllShowMetadata();
      for (const show of shows) {
        const meta = metadata.get(show.id);
        if (meta) {
          show.semester = meta.semester || undefined;
        }
      }
    } catch (metaError) {
      console.warn("Failed to fetch show metadata:", metaError);
      // Continue without metadata - shows still work
    }
    
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
    const { name, semester } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Show name is required" },
        { status: 400 }
      );
    }

    if (!semester || typeof semester !== "string") {
      return NextResponse.json(
        { error: "Semester is required" },
        { status: 400 }
      );
    }

    // Auto-suffix show name with semester code (e.g., "ShowName_F25")
    const fullName = `${name.trim()}_${semester.toUpperCase()}`;

    // Handle offline mode
    if (config.mode === "offline") {
      const offlineShowsList = getOfflineShows();
      // Check for duplicate name
      if (offlineShowsList.some(s => s.name.toLowerCase() === fullName.toLowerCase())) {
        return NextResponse.json(
          { error: "A show with this name already exists" },
          { status: 400 }
        );
      }

      const newShow: Show = {
        id: `show-${Date.now()}`,
        name: fullName,
        active: true,
        defaultMinCores: 1,
        defaultMaxCores: 4,
        semester: semester.toUpperCase()
      };
      setOfflineShows([...offlineShowsList, newShow]);
      return NextResponse.json({ success: true, show: newShow });
    }

    const result = await createShow(fullName);
    
    // Set semester metadata if provided
    if (result.show?.id) {
      try {
        await setShowSemester(result.show.id, semester);
        result.show.semester = semester.toUpperCase();
      } catch (metaError) {
        console.warn("Failed to set semester metadata:", metaError);
        // Show was created, just without semester
      }
    }
    
    return NextResponse.json({ success: true, show: result.show });
  } catch (error) {
    console.error("Failed to create show:", error);
    return NextResponse.json(
      { error: "Failed to create show" },
      { status: 500 }
    );
  }
}
