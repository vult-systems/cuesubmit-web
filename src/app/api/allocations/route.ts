import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getAllocations, createAllocation, deleteAllocation } from "@/lib/opencue/gateway-client";
import { config } from "@/lib/config";
import { ROOMS } from "@/lib/mock-data";

// Mock allocations for offline mode
function generateMockAllocations() {
  return ROOMS.map((room) => ({
    id: `alloc-${room.toLowerCase()}`,
    name: room.toLowerCase(),
    tag: room.toLowerCase(),
    facility: "local",
  }));
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Return mock data in offline mode
    if (config.mode === "offline") {
      return NextResponse.json({ allocations: generateMockAllocations() });
    }

    const result = await getAllocations();

    // Extract allocations from response
    let allocations: unknown[] = [];
    if (Array.isArray(result)) {
      allocations = result;
    } else if (result && typeof result === "object") {
      if ("allocations" in result) {
        const allocs = result.allocations;
        if (Array.isArray(allocs)) {
          allocations = allocs;
        } else if (allocs && typeof allocs === "object" && "allocations" in allocs) {
          allocations = (allocs as { allocations: unknown[] }).allocations || [];
        }
      }
    }

    return NextResponse.json({ allocations });
  } catch (error) {
    // Gateway doesn't implement GetAllocations - return mock data instead of erroring
    // This prevents lag from repeated failed API calls
    console.warn("Allocations API unavailable, using mock data");
    return NextResponse.json({ allocations: generateMockAllocations() });
  }
}

// Create a new allocation (admin only)
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden - admin only" }, { status: 403 });
    }

    if (config.mode === "offline") {
      return NextResponse.json({ error: "Cannot create allocations in offline mode" }, { status: 400 });
    }

    const body = await request.json();
    const { name, tag, facility = "local" } = body;

    if (!name || !tag) {
      return NextResponse.json({ error: "Name and tag are required" }, { status: 400 });
    }

    const result = await createAllocation(name, tag, facility);
    return NextResponse.json({ allocation: result.allocation });
  } catch (error) {
    console.error("Failed to create allocation:", error);
    const message = error instanceof Error ? error.message : "Failed to create allocation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Delete an allocation (admin only)
export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden - admin only" }, { status: 403 });
    }

    if (config.mode === "offline") {
      return NextResponse.json({ error: "Cannot delete allocations in offline mode" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const allocationId = searchParams.get("id");

    if (!allocationId) {
      return NextResponse.json({ error: "Allocation ID is required" }, { status: 400 });
    }

    await deleteAllocation(allocationId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete allocation:", error);
    const message = error instanceof Error ? error.message : "Failed to delete allocation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
