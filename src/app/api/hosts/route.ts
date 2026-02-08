import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getHosts, type Host } from "@/lib/opencue/gateway-client";

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

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
