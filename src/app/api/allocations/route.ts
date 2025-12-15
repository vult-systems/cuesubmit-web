import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getAllocations } from "@/lib/opencue/gateway-client";
import { config } from "@/lib/config";
import { ROOMS } from "@/lib/mock-data";

// Mock allocations for offline mode
function generateMockAllocations() {
  return ROOMS.map((room, index) => ({
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
    console.error("Failed to fetch allocations:", error);
    return NextResponse.json(
      { error: "Failed to fetch allocations" },
      { status: 500 }
    );
  }
}
