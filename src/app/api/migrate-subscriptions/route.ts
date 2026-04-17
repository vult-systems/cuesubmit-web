import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import {
  getShows,
  getAllocations,
  getShowSubscriptions,
  createSubscription,
  deleteSubscription,
  setShowDefaultMaxCores,
  type Show,
  type Allocation,
  type Subscription,
} from "@/lib/opencue/gateway-client";
import { config } from "@/lib/config";

const DEFAULT_ALLOCATION_NAME = "local.general";
const SNDBX_ALLOCATION_NAME = "local.ad405";
const TARGET_BURST = 2000; // full cores
const TARGET_MAX_CORES = 2000; // full cores

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

function extractSubscriptions(data: unknown): Subscription[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && "subscriptions" in data) {
    const subs = (data as { subscriptions: unknown }).subscriptions;
    if (Array.isArray(subs)) return subs;
    if (subs && typeof subs === "object" && "subscriptions" in subs) {
      return (subs as { subscriptions: Subscription[] }).subscriptions || [];
    }
  }
  return [];
}

/**
 * POST /api/migrate-subscriptions
 *
 * One-time migration: ensures every show is subscribed to local.general
 * (except sndbx → local.ad405), removes stale per-room subscriptions,
 * and raises defaultMaxCores so the scheduler can use the full farm.
 *
 * Requires admin role. Safe to run multiple times (idempotent).
 */
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(user.role, "manage_shows")) {
      return NextResponse.json({ error: "Admin required" }, { status: 403 });
    }
    if (config.mode === "offline") {
      return NextResponse.json({ error: "Cannot run in offline mode" }, { status: 400 });
    }

    // Fetch all shows and allocations
    const [showResult, allocResult] = await Promise.all([
      getShows(),
      getAllocations(),
    ]);
    const shows = extractShows(showResult);
    const allocations = extractAllocations(allocResult);

    const generalAlloc = allocations.find(
      (a) => a.name.toLowerCase() === DEFAULT_ALLOCATION_NAME
    );
    const sndbxAlloc = allocations.find(
      (a) => a.name.toLowerCase() === SNDBX_ALLOCATION_NAME
    );

    if (!generalAlloc) {
      return NextResponse.json(
        { error: `Allocation '${DEFAULT_ALLOCATION_NAME}' not found` },
        { status: 500 }
      );
    }

    const log: string[] = [];
    let subscriptionsCreated = 0;
    let subscriptionsDeleted = 0;
    let maxCoresUpdated = 0;
    let errors = 0;

    for (const show of shows) {
      const isSndbx = show.name.toLowerCase().startsWith("sndbx");
      const targetAllocName = isSndbx ? SNDBX_ALLOCATION_NAME : DEFAULT_ALLOCATION_NAME;
      const targetAlloc = isSndbx ? (sndbxAlloc ?? generalAlloc) : generalAlloc;

      // 1. Raise defaultMaxCores
      try {
        await setShowDefaultMaxCores(show.id, TARGET_MAX_CORES);
        maxCoresUpdated++;
        log.push(`[${show.name}] set defaultMaxCores → ${TARGET_MAX_CORES}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.push(`[${show.name}] FAILED setDefaultMaxCores: ${msg}`);
        errors++;
      }

      // 2. Fetch current subscriptions
      let subs: Subscription[];
      try {
        const subResult = await getShowSubscriptions(show.id);
        subs = extractSubscriptions(subResult);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.push(`[${show.name}] FAILED to fetch subscriptions: ${msg}`);
        errors++;
        continue;
      }

      // 3. Check if already subscribed to the target allocation
      const hasTarget = subs.some(
        (s) => s.allocationName.toLowerCase() === targetAllocName
      );

      // 4. Create target subscription if missing
      if (!hasTarget) {
        try {
          await createSubscription(show.id, targetAlloc.id, 0, TARGET_BURST);
          subscriptionsCreated++;
          log.push(`[${show.name}] created subscription → ${targetAllocName} (burst ${TARGET_BURST})`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("already exists") || msg.includes("duplicate")) {
            log.push(`[${show.name}] subscription to ${targetAllocName} already exists (skipped)`);
          } else {
            log.push(`[${show.name}] FAILED to create subscription: ${msg}`);
            errors++;
          }
        }
      } else {
        log.push(`[${show.name}] already subscribed to ${targetAllocName}`);
      }

      // 5. Delete subscriptions to other allocations (stale per-room subs)
      for (const sub of subs) {
        if (sub.allocationName.toLowerCase() === targetAllocName) continue;
        try {
          await deleteSubscription(sub.id);
          subscriptionsDeleted++;
          log.push(`[${show.name}] deleted subscription → ${sub.allocationName}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.push(`[${show.name}] FAILED to delete subscription ${sub.allocationName}: ${msg}`);
          errors++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        showsProcessed: shows.length,
        subscriptionsCreated,
        subscriptionsDeleted,
        maxCoresUpdated,
        errors,
      },
      log,
    });
  } catch (error) {
    console.error("Migration failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Migration failed" },
      { status: 500 }
    );
  }
}
