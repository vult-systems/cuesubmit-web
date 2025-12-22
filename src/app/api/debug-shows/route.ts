import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { 
  getAllocations, 
  createShow,
  createSubscription,
  getShows,
  type Allocation,
  type Show
} from "@/lib/opencue/gateway-client";
import { config } from "@/lib/config";

// Room allocations
const ROOMS = ['AD400', 'AD404', 'AD405', 'AD406', 'AD407', 'AD415'];

// Extract allocations from gateway response
function extractAllocations(data: unknown): Allocation[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && "allocations" in data) {
    const allocs = (data as { allocations: unknown }).allocations;
    if (Array.isArray(allocs)) return allocs;
    if (allocs && typeof allocs === "object" && "allocations" in allocs) {
      return (allocs as { allocations: Allocation[] }).allocations || [];
    }
  }
  return [];
}

// Extract shows from gateway response
function extractShows(data: unknown): Show[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && "shows" in data) {
    const shows = (data as { shows: unknown }).shows;
    if (Array.isArray(shows)) return shows;
    if (shows && typeof shows === "object" && "shows" in shows) {
      return (shows as { shows: Show[] }).shows || [];
    }
  }
  return [];
}

// GET - Get debug show status
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only admins can view debug shows
    if (!hasPermission(user.role, "manage_shows")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    if (config.mode === "offline") {
      return NextResponse.json({
        debugShows: ROOMS.map(room => ({
          name: `DEBUG_${room}`,
          room,
          exists: true,
          subscribed: true
        }))
      });
    }

    // Get all shows
    const showResult = await getShows();
    const shows = extractShows(showResult);
    
    // Get all allocations
    const allocResult = await getAllocations();
    const allocations = extractAllocations(allocResult);

    // Check which debug shows exist
    const debugShows = ROOMS.map(room => {
      const showName = `DEBUG_${room}`;
      const show = shows.find(s => s.name === showName);
      const alloc = allocations.find(a => a.tag?.toLowerCase() === room.toLowerCase());
      
      return {
        name: showName,
        room,
        exists: !!show,
        hasAllocation: !!alloc,
        allocationName: alloc?.name
      };
    });

    return NextResponse.json({ debugShows });
  } catch (error) {
    console.error("Failed to get debug show status:", error);
    return NextResponse.json(
      { error: "Failed to get debug show status" },
      { status: 500 }
    );
  }
}

// POST - Create debug shows for all rooms
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only admins can create debug shows
    if (!hasPermission(user.role, "manage_shows")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    if (config.mode === "offline") {
      return NextResponse.json({
        success: true,
        created: ROOMS.length,
        subscribed: ROOMS.length,
        errors: 0
      });
    }

    // Get existing shows
    const showResult = await getShows();
    const existingShows = extractShows(showResult);
    
    // Get allocations
    const allocResult = await getAllocations();
    const allocations = extractAllocations(allocResult);

    let created = 0;
    let subscribed = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    for (const room of ROOMS) {
      const showName = `DEBUG_${room}`;
      
      // Check if show already exists
      let show = existingShows.find(s => s.name === showName);
      
      // Create show if it doesn't exist
      if (!show) {
        try {
          const result = await createShow(showName);
          show = result.show;
          created++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          if (!msg.includes('already exists') && !msg.includes('duplicate')) {
            errors++;
            errorMessages.push(`Failed to create ${showName}: ${msg}`);
            continue;
          }
        }
      }

      // Find room allocation
      const alloc = allocations.find(a => a.tag?.toLowerCase() === room.toLowerCase());
      if (!alloc) {
        errorMessages.push(`No allocation found for room ${room}`);
        continue;
      }

      // Create subscription
      if (show) {
        try {
          await createSubscription(show.id, alloc.id, 0, 100);
          subscribed++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          if (!msg.includes('already exists') && !msg.includes('duplicate')) {
            errorMessages.push(`Failed to subscribe ${showName}: ${msg}`);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      created,
      subscribed,
      errors,
      errorMessages: errorMessages.length > 0 ? errorMessages : undefined
    });
  } catch (error) {
    console.error("Failed to create debug shows:", error);
    return NextResponse.json(
      { error: "Failed to create debug shows" },
      { status: 500 }
    );
  }
}
