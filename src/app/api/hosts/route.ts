import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getHosts, type Host } from "@/lib/opencue/gateway-client";
import { config } from "@/lib/config";
import { ROOMS, MACHINES_PER_ROOM, randomSystemName } from "@/lib/mock-data";

// OpenCue REST Gateway returns camelCase fields with some values as strings
interface OpenCueHost {
  id: string;
  name: string;
  // Both snake_case and camelCase variants (gateway uses camelCase)
  alloc_name?: string;
  allocName?: string;
  nimby_enabled?: boolean;
  nimbyEnabled?: boolean;
  has_comment?: boolean;
  hasComment?: boolean;
  cores?: number | string;
  idle_cores?: number | string;
  idleCores?: number | string;
  memory?: number | string;
  idle_memory?: number | string;
  idleMemory?: number | string;
  gpu_memory?: number | string;
  gpuMemory?: number | string;
  idle_gpu_memory?: number | string;
  idleGpuMemory?: number | string;
  total_swap?: number | string;
  totalSwap?: number | string;
  total_memory?: number | string;
  totalMemory?: number | string;
  total_gpu_memory?: number | string;
  totalGpuMemory?: number | string;
  total_mcp?: number | string;
  totalMcp?: number | string;
  free_swap?: number | string;
  freeSwap?: number | string;
  free_memory?: number | string;
  freeMemory?: number | string;
  free_mcp?: number | string;
  freeMcp?: number | string;
  free_gpu_memory?: number | string;
  freeGpuMemory?: number | string;
  load?: number | string;
  boot_time?: number | string;
  bootTime?: number | string;
  ping_time?: number | string;
  pingTime?: number | string;
  os?: string;
  tags?: string[];
  state?: string | number;
  lock_state?: string | number;
  lockState?: string | number;
  thread_mode?: string;
  threadMode?: string;
  gpus?: number | string;
  idle_gpus?: number | string;
  idleGpus?: number | string;
}

// Helper to safely parse numbers from string or number values
function toNumber(value: number | string | undefined | null): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "number") return value;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? 0 : parsed;
}

// OpenCue enums - map numeric values to strings
const HOST_STATE_MAP: Record<number, string> = {
  0: "UP",
  1: "DOWN",
  2: "REPAIR",
  3: "UNKNOWN",
};

const LOCK_STATE_MAP: Record<number, string> = {
  0: "OPEN",
  1: "LOCKED",
  2: "NIMBY_LOCKED",
};

function mapState(value: string | number | undefined): string {
  if (value === undefined || value === null) return "UNKNOWN";
  if (typeof value === "number") return HOST_STATE_MAP[value] || "UNKNOWN";
  return String(value).toUpperCase() || "UNKNOWN";
}

function mapLockState(value: string | number | undefined): string {
  if (value === undefined || value === null) return "UNKNOWN";
  if (typeof value === "number") return LOCK_STATE_MAP[value] || "UNKNOWN";
  return String(value).toUpperCase() || "UNKNOWN";
}

// Map OpenCue host data to our Host interface
// Handles both snake_case and camelCase field names, and string/number values
function mapOpenCueHost(h: OpenCueHost): Host {
  // Use totalMemory/freeMemory for actual physical memory (not OpenCue allocation pool)
  // OpenCue reports memory in KB, convert to bytes for display
  const totalMemory = toNumber(h.totalMemory ?? h.total_memory) * 1024;
  const freeMemory = toNumber(h.freeMemory ?? h.free_memory) * 1024;
  const totalSwap = toNumber(h.totalSwap ?? h.total_swap) * 1024;
  const freeSwap = toNumber(h.freeSwap ?? h.free_swap) * 1024;

  return {
    id: h.id,
    name: h.name,
    state: mapState(h.state),
    lockState: mapLockState(h.lock_state ?? h.lockState),
    nimbyEnabled: h.nimby_enabled ?? h.nimbyEnabled ?? false,
    cores: toNumber(h.cores),
    idleCores: toNumber(h.idleCores ?? h.idle_cores),
    // Physical memory (total and free)
    memory: totalMemory,
    idleMemory: freeMemory,
    // Swap (total and free)
    swap: totalSwap,
    freeSwap: freeSwap,
    // GPU
    gpuMemory: toNumber(h.totalGpuMemory ?? h.total_gpu_memory ?? h.gpuMemory ?? h.gpu_memory) * 1024,
    idleGpuMemory: toNumber(h.freeGpuMemory ?? h.free_gpu_memory ?? h.idleGpuMemory ?? h.idle_gpu_memory) * 1024,
    gpus: toNumber(h.gpus),
    idleGpus: toNumber(h.idleGpus ?? h.idle_gpus),
    // Load is already a percentage (0-100+)
    load: toNumber(h.load),
    bootTime: toNumber(h.bootTime ?? h.boot_time),
    pingTime: toNumber(h.pingTime ?? h.ping_time),
    tags: h.tags || [],
    alloc: h.allocName ?? h.alloc_name ?? "",
  };
}

// Helper to extract nested array from gateway response
function extractHosts(data: unknown): OpenCueHost[] {
  // Log first host to debug field names
  if (data && typeof data === "object" && "hosts" in data) {
    const hosts = (data as { hosts: unknown }).hosts;
    if (hosts && typeof hosts === "object" && "hosts" in hosts) {
      const hostArray = (hosts as { hosts: OpenCueHost[] }).hosts;
      if (hostArray && hostArray.length > 0) {
        console.log("[DEBUG] First host raw data:", JSON.stringify(hostArray[0], null, 2));
      }
    }
  }

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
      
      // Swap (8GB or 16GB)
      const swap = Math.random() > 0.5 ? 16000000000 : 8000000000;
      const freeSwap = state === "UP" ? Math.floor(Math.random() * swap) : 0;

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
        swap,
        freeSwap,
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
