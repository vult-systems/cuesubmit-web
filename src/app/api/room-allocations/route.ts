import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { 
  getAllocations, 
  getHosts,
  setHostAllocation,
  type Allocation,
  type Host
} from "@/lib/opencue/gateway-client";
import { config } from "@/lib/config";

// Room allocations that exist (lowercase)
const ROOM_ALLOCATIONS = ['ad400', 'ad404', 'ad405', 'ad406', 'ad407', 'ad415'];

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

interface OpenCueHost {
  id: string;
  name: string;
  alloc_name?: string;
  allocName?: string;
  tags?: string[];
}

// Extract hosts from gateway response
function extractHosts(data: unknown): OpenCueHost[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && "hosts" in data) {
    const hosts = (data as { hosts: unknown }).hosts;
    if (Array.isArray(hosts)) return hosts;
    if (hosts && typeof hosts === "object" && "hosts" in hosts) {
      return (hosts as { hosts: OpenCueHost[] }).hosts || [];
    }
  }
  return [];
}

// GET - Get room allocation status (which hosts are in which room allocations)
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only admins can view room allocation status
    if (!hasPermission(user.role, "manage_allocations")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    // Mock data for offline mode
    if (config.mode === "offline") {
      return NextResponse.json({
        allocations: ROOM_ALLOCATIONS.map(room => ({
          name: `local.${room}`,
          tag: room,
          hostCount: 15,
          assignedCount: 12
        }))
      });
    }

    // Get all allocations
    const allocResult = await getAllocations();
    const allocations = extractAllocations(allocResult);
    
    // Get all hosts
    const hostResult = await getHosts();
    const hosts = extractHosts(hostResult);

    // Build room allocation status
    const roomAllocations = allocations
      .filter(a => ROOM_ALLOCATIONS.includes(a.tag?.toLowerCase() || ''))
      .map(alloc => {
        const tag = alloc.tag?.toLowerCase() || '';
        // Count hosts with this tag
        const hostsWithTag = hosts.filter(h => 
          h.tags?.some(t => t.toLowerCase() === tag.toUpperCase())
        );
        // Count hosts assigned to this allocation
        const assignedHosts = hosts.filter(h => {
          const allocName = h.allocName || h.alloc_name || '';
          return allocName.toLowerCase() === alloc.name.toLowerCase();
        });

        return {
          id: alloc.id,
          name: alloc.name,
          tag: alloc.tag,
          hostCount: hostsWithTag.length,
          assignedCount: assignedHosts.length
        };
      });

    return NextResponse.json({ allocations: roomAllocations });
  } catch (error) {
    console.error("Failed to get room allocation status:", error);
    return NextResponse.json(
      { error: "Failed to get room allocation status" },
      { status: 500 }
    );
  }
}

// POST - Auto-assign hosts to their room allocations based on tags
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only admins can auto-assign
    if (!hasPermission(user.role, "manage_allocations")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await request.json();
    const { room } = body; // Optional: specific room to sync, or all if not specified

    // Mock mode
    if (config.mode === "offline") {
      return NextResponse.json({
        success: true,
        assigned: 12,
        skipped: 3,
        errors: 0
      });
    }

    // Get all allocations
    const allocResult = await getAllocations();
    const allocations = extractAllocations(allocResult);
    
    // Get all hosts
    const hostResult = await getHosts();
    const hosts = extractHosts(hostResult);

    // Build map of room tag -> allocation ID
    const roomToAllocation = new Map<string, string>();
    for (const alloc of allocations) {
      const tag = alloc.tag?.toLowerCase();
      if (tag && ROOM_ALLOCATIONS.includes(tag)) {
        roomToAllocation.set(tag.toUpperCase(), alloc.id);
      }
    }

    let assigned = 0;
    let skipped = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    // Find hosts that have room tags and assign them to proper allocation
    for (const host of hosts) {
      const tags = host.tags || [];
      const currentAlloc = (host.allocName || host.alloc_name || '').toLowerCase();
      
      // Find room tag on this host
      const roomTag = tags.find(t => roomToAllocation.has(t.toUpperCase()));
      if (!roomTag) continue; // No room tag, skip
      
      // Filter by specific room if requested
      if (room && roomTag.toUpperCase() !== room.toUpperCase()) continue;

      const targetAllocId = roomToAllocation.get(roomTag.toUpperCase())!;
      const targetAllocName = `local.${roomTag.toLowerCase()}`;
      
      // Already in correct allocation?
      if (currentAlloc === targetAllocName) {
        skipped++;
        continue;
      }

      // Assign to room allocation
      try {
        await setHostAllocation(host.id, targetAllocId);
        assigned++;
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errorMessages.push(`${host.name}: ${msg}`);
      }
    }

    return NextResponse.json({
      success: true,
      assigned,
      skipped,
      errors,
      errorMessages: errorMessages.length > 0 ? errorMessages : undefined
    });
  } catch (error) {
    console.error("Failed to auto-assign hosts:", error);
    return NextResponse.json(
      { error: "Failed to auto-assign hosts" },
      { status: 500 }
    );
  }
}
