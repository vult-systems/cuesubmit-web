import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getHosts, type Host } from "@/lib/opencue/gateway-client";
import { config } from "@/lib/config";
import { ROOMS, MACHINES_PER_ROOM, randomSystemName } from "@/lib/mock-data";

// OpenCue API response has snake_case fields - map to our camelCase
interface OpenCueHost {
  id: string;
  name: string;
  alloc_name?: string;
  nimby_enabled?: boolean;
  has_comment?: boolean;
  cores?: number;
  idle_cores?: number;
  memory?: number;
  idle_memory?: number;
  gpu_memory?: number;
  idle_gpu_memory?: number;
  total_swap?: number;
  total_memory?: number;
  total_gpu_memory?: number;
  total_mcp?: number;
  free_swap?: number;
  free_memory?: number;
  free_mcp?: number;
  free_gpu_memory?: number;
  load?: number;
  boot_time?: number;
  ping_time?: number;
  os?: string;
  tags?: string[];
  state?: string;
  lock_state?: string;
  thread_mode?: string;
  gpus?: number;
  idle_gpus?: number;
}

// Map OpenCue snake_case to our camelCase Host interface
function mapOpenCueHost(h: OpenCueHost): Host {
  return {
    id: h.id,
    name: h.name,
    state: h.state || "UNKNOWN",
    lockState: h.lock_state || "UNKNOWN",
    nimbyEnabled: h.nimby_enabled || false,
    cores: h.cores || 0,
    idleCores: h.idle_cores || 0,
    memory: h.total_memory || h.memory || 0,
    idleMemory: h.free_memory || h.idle_memory || 0,
    gpuMemory: h.total_gpu_memory || h.gpu_memory || 0,
    idleGpuMemory: h.free_gpu_memory || h.idle_gpu_memory || 0,
    gpus: h.gpus || 0,
    idleGpus: h.idle_gpus || 0,
    load: h.load || 0,
    bootTime: h.boot_time || 0,
    pingTime: h.ping_time || 0,
    tags: h.tags || [],
    alloc: h.alloc_name || "",
  };
}

// Helper to extract nested array from gateway response
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

    // Gateway returns { hosts: { hosts: [...] } } - extract and map to our format
    const rawHosts = extractHosts(result);
    const hosts = rawHosts.map(mapOpenCueHost);

    return NextResponse.json({ hosts });
  } catch (error) {
    console.error("Failed to fetch hosts:", error);
    return NextResponse.json(
      { error: "Failed to fetch hosts" },
      { status: 500 }
    );
  }
}
