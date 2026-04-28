import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getHosts, unlockHost } from "@/lib/opencue/gateway-client";

// Numeric enum values from OpenCue protobuf
const LOCK_STATE_LOCKED = 1;  // LOCKED (CueNimby or manual)
const LOCK_STATE_NIMBY  = 2;  // NIMBY_LOCKED
const HOST_STATE_UP = 0;      // UP

// The REST gateway may return lockState/state as either a numeric enum OR a string.
// e.g. lockState: "LOCKED" or lockState: 1, state: "UP" or state: 0
function isLockStateLocked(v: number | string | undefined): boolean {
  return v === LOCK_STATE_LOCKED || v === "LOCKED";
}
function isLockStateNimby(v: number | string | undefined): boolean {
  return v === LOCK_STATE_NIMBY || v === "NIMBY_LOCKED";
}
function isStateUp(v: number | string | undefined): boolean {
  return v === HOST_STATE_UP || v === "UP";
}

interface RawHost {
  id?: string;
  name?: string;
  state?: number | string;
  lock_state?: number | string;
  lockState?: number | string;
  cores?: number | string;
  idle_cores?: number | string;
  idleCores?: number | string;
}

function toNum(v: number | string | undefined): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number") return v;
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : n;
}

function extractRawHosts(data: unknown): RawHost[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.hosts)) return d.hosts as RawHost[];
    if (d.hosts && typeof d.hosts === "object") {
      const inner = (d.hosts as Record<string, unknown>).hosts;
      if (Array.isArray(inner)) return inner as RawHost[];
    }
  }
  return [];
}

/**
 * POST /api/admin/hosts/auto-unlock
 *
 * Finds UP + locked hosts and unlocks them.
 * - NIMBY_LOCKED: always unlocked (stale CueNimby lock)
 * - LOCKED: only when fully idle, unless ?force=true which unlocks all regardless
 *
 * Returns { unlocked: [{id, name}], count: number, errors: [{id, name, error}] }
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(user.role, "lock_hosts")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const result = await getHosts();
    const rawHosts = extractRawHosts(result);

    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "true";

    const eligible = rawHosts.filter((h) => {
      const lockState = h.lock_state ?? h.lockState;
      const cores = toNum(h.cores);
      const idleCores = toNum(h.idleCores ?? h.idle_cores);
      if (!isStateUp(h.state) || cores === 0) return false;
      // NIMBY_LOCKED = CueNimby is actively protecting a logged-in machine.
      // Only clear on an explicit force request (admin post-class cleanup).
      // Never clear automatically — CueNimby will keep re-locking active machines.
      if (isLockStateNimby(lockState)) return force;
      // LOCKED = manually locked. Clear when idle, or always on force.
      if (isLockStateLocked(lockState)) return force || idleCores >= cores;
      return false;
    });

    if (eligible.length === 0) {
      return NextResponse.json({ unlocked: [], count: 0, errors: [] });
    }

    // Unlock all eligible hosts in parallel
    const results = await Promise.allSettled(
      eligible.map((h) => unlockHost(h.id!, h.name))
    );

    const unlocked: { id: string; name: string }[] = [];
    const errors: { id: string; name: string; error: string }[] = [];

    results.forEach((r, i) => {
      const h = eligible[i];
      if (r.status === "fulfilled") {
        unlocked.push({ id: h.id!, name: h.name! });
      } else {
        errors.push({
          id: h.id!,
          name: h.name!,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    });

    return NextResponse.json({ unlocked, count: unlocked.length, errors });
  } catch (error) {
    console.error("Auto-unlock failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Auto-unlock failed" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/hosts/auto-unlock
 *
 * Preview: returns which hosts would be auto-unlocked without actually unlocking.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(user.role, "lock_hosts")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const result = await getHosts();
    const rawHosts = extractRawHosts(result);

    const eligible = rawHosts.filter((h) => {
      const lockState = h.lock_state ?? h.lockState;
      const cores = toNum(h.cores);
      const idleCores = toNum(h.idleCores ?? h.idle_cores);
      if (!isStateUp(h.state) || cores === 0) return false;
      if (isLockStateNimby(lockState)) return true;
      if (isLockStateLocked(lockState)) return idleCores >= cores;
      return false;
    });

    return NextResponse.json({
      eligible: eligible.map((h) => ({ id: h.id, name: h.name })),
      count: eligible.length,
    });
  } catch (error) {
    console.error("Auto-unlock preview failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
