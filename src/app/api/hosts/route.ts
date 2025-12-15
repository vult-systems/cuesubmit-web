import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getHosts, type Host } from "@/lib/opencue/gateway-client";
import { config } from "@/lib/config";
import { ROOMS, MACHINES_PER_ROOM, randomSystemName } from "@/lib/mock-data";

// Helper to extract nested array from gateway response
function extractHosts(data: { hosts: Host[] } | Host[]): Host[] {
  if (Array.isArray(data)) return data;
  return data.hosts || [];
}

// Mock hosts for offline mode - Lab machines
function generateMockHosts(): Host[] {
  const hosts: Host[] = [];
  let ipCounter = 1;
  
  for (const room of ROOMS) {
    for (let i = 1; i <= MACHINES_PER_ROOM; i++) {
      const machineNum = i.toString().padStart(2, "0");
      const name = `${room}-${machineNum}`;
      const systemName = randomSystemName();
      const ipAddress = `10.40.14.${ipCounter}`;
      
      // Randomize state - most UP, some DOWN or REPAIR
      const stateRoll = Math.random();
      const state = stateRoll > 0.15 ? "UP" : stateRoll > 0.05 ? "DOWN" : "REPAIR";
      
      // Randomize lock state
      const lockRoll = Math.random();
      const lockState = lockRoll > 0.1 ? "OPEN" : "LOCKED";
      
      // Randomize nimby
      const nimbyEnabled = Math.random() > 0.8;
      
      // CPU cores (32 or 64)
      const cores = Math.random() > 0.5 ? 64 : 32;
      const idleCores = state === "UP" ? Math.floor(Math.random() * cores) : 0;
      
      // Memory (64GB or 128GB)
      const memory = Math.random() > 0.5 ? 128000000000 : 64000000000;
      const idleMemory = state === "UP" ? Math.floor(Math.random() * memory) : 0;
      
      // GPU (some machines have GPUs)
      const hasGpu = Math.random() > 0.6;
      const gpus = hasGpu ? 1 : 0;
      const gpuMemory = hasGpu ? 24000000000 : 0;
      const idleGpus = hasGpu && state === "UP" ? (Math.random() > 0.3 ? 1 : 0) : 0;
      const idleGpuMemory = idleGpus > 0 ? gpuMemory : 0;
      
      // Load
      const load = state === "UP" ? Math.floor(Math.random() * 100) : 0;
      
      hosts.push({
        id: `host-${room.toLowerCase()}-${machineNum}`,
        name: `${name} (${systemName})`,
        state,
        lockState,
        nimbyEnabled,
        nimbyLocked: nimbyEnabled && Math.random() > 0.5,
        cores,
        idleCores,
        memory,
        idleMemory,
        gpuMemory,
        idleGpuMemory,
        gpus,
        idleGpus,
        load,
        bootTime: Date.now() - Math.floor(Math.random() * 604800000), // Up to 7 days ago
        pingTime: Date.now() - Math.floor(Math.random() * 60000), // Up to 1 minute ago
        tags: hasGpu ? ["gpu", "render", room.toLowerCase()] : ["cpu", "render", room.toLowerCase()],
        alloc: room.toLowerCase(),
        ipAddress
      });
      
      ipCounter++;
    }
  }
  
  return hosts;
}

const MOCK_HOSTS: Host[] = generateMockHosts();

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Return mock data in offline mode
    if (config.mode === "offline") {
      return NextResponse.json({ hosts: MOCK_HOSTS });
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
