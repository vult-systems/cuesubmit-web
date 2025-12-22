import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import {
  setShowActive,
  setShowDefaultMinCores,
  setShowDefaultMaxCores,
  deleteShow,
  getShowSubscriptions,
  deleteSubscription,
  type Show,
} from "@/lib/opencue/gateway-client";
import { forceDeleteShow, renameShow } from "@/lib/opencue/database";
import { config } from "@/lib/config";
import { getOfflineShows, setOfflineShows } from "@/lib/offline-shows";

// Helper types
type ActionResult = { success: true; show?: Show } | { error: string; status: number };

// Validate string value for rename
function validateStringValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// Validate number value for cores
function validateNumberValue(value: unknown): value is number {
  return typeof value === "number" && value >= 0;
}

// Handle offline mode actions
function handleOfflineAction(
  shows: Show[],
  showIndex: number,
  action: string,
  value: unknown
): ActionResult {
  const show = shows[showIndex];

  switch (action) {
    case "activate":
      show.active = true;
      return { success: true, show };

    case "deactivate":
      show.active = false;
      return { success: true, show };

    case "rename": {
      if (!validateStringValue(value)) {
        return { error: "New name is required", status: 400 };
      }
      const isDuplicate = shows.some(
        (s) => s.id !== show.id && s.name.toLowerCase() === value.trim().toLowerCase()
      );
      if (isDuplicate) {
        return { error: "A show with this name already exists", status: 400 };
      }
      show.name = value.trim();
      return { success: true, show };
    }

    case "setMinCores":
      if (!validateNumberValue(value)) {
        return { error: "Invalid min cores value", status: 400 };
      }
      show.defaultMinCores = value;
      return { success: true, show };

    case "setMaxCores":
      if (!validateNumberValue(value)) {
        return { error: "Invalid max cores value", status: 400 };
      }
      show.defaultMaxCores = value;
      return { success: true, show };

    default:
      return { error: "Unknown action", status: 400 };
  }
}

// Handle online mode actions
async function handleOnlineAction(
  id: string,
  action: string,
  value: unknown
): Promise<ActionResult> {
  switch (action) {
    case "activate":
      await setShowActive(id, true);
      return { success: true };

    case "deactivate":
      await setShowActive(id, false);
      return { success: true };

    case "rename": {
      if (!validateStringValue(value)) {
        return { error: "New name is required", status: 400 };
      }
      const renameResult = await renameShow(id, value.trim());
      if (!renameResult.success) {
        return { error: renameResult.error || "Failed to rename show", status: 400 };
      }
      return { success: true };
    }

    case "setMinCores":
      if (!validateNumberValue(value)) {
        return { error: "Invalid min cores value", status: 400 };
      }
      await setShowDefaultMinCores(id, value);
      return { success: true };

    case "setMaxCores":
      if (!validateNumberValue(value)) {
        return { error: "Invalid max cores value", status: 400 };
      }
      await setShowDefaultMaxCores(id, value);
      return { success: true };

    default:
      return { error: "Unknown action", status: 400 };
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(user.role, "manage_shows")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action, value } = body;

    // Handle offline mode
    if (config.mode === "offline") {
      const shows = getOfflineShows();
      const showIndex = shows.findIndex((s) => s.id === id);

      if (showIndex === -1) {
        return NextResponse.json({ error: "Show not found" }, { status: 404 });
      }

      const result = handleOfflineAction(shows, showIndex, action, value);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      setOfflineShows(shows);
      return NextResponse.json({ success: true, show: result.show });
    }

    // Online mode
    const result = await handleOnlineAction(id, action, value);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Show action failed:", error);
    return NextResponse.json({ error: "Show action failed" }, { status: 500 });
  }
}

// Handle offline delete
function handleOfflineDelete(id: string): ActionResult {
  const shows = getOfflineShows();
  const showIndex = shows.findIndex((s) => s.id === id);

  if (showIndex === -1) {
    return { error: "Show not found", status: 404 };
  }

  shows.splice(showIndex, 1);
  setOfflineShows(shows);
  return { success: true };
}

// Handle force delete
async function handleForceDelete(id: string) {
  console.log(`Force deleting show ${id} including job history...`);
  const result = await forceDeleteShow(id);

  if (result.success) {
    console.log(`Force deleted show ${id}: ${result.deletedJobs} jobs, ${result.deletedSubscriptions} subscriptions`);
    return NextResponse.json({
      success: true,
      deletedJobs: result.deletedJobs,
      deletedSubscriptions: result.deletedSubscriptions,
    });
  }

  return NextResponse.json(
    { error: result.error || "Force delete failed" },
    { status: 500 }
  );
}

// Handle normal delete with subscription cleanup
async function handleNormalDelete(id: string) {
  // Get and delete all subscriptions
  const subscriptionsResponse = await getShowSubscriptions(id);
  const subscriptions = Array.isArray(subscriptionsResponse.subscriptions)
    ? subscriptionsResponse.subscriptions
    : subscriptionsResponse.subscriptions?.subscriptions || [];

  for (const subscription of subscriptions) {
    try {
      await deleteSubscription(subscription.id);
      console.log(`Deleted subscription: ${subscription.name || subscription.id}`);
    } catch (subError) {
      console.error(`Failed to delete subscription ${subscription.id}:`, subError);
    }
  }

  await deleteShow(id);
  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== "admin") {
      return NextResponse.json(
        { error: "Only administrators can delete shows" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const url = new URL(request.url);
    const forceDeleteParam = url.searchParams.get("force") === "true";

    // Handle offline mode
    if (config.mode === "offline") {
      const result = handleOfflineDelete(id);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ success: true });
    }

    // Force delete
    if (forceDeleteParam) {
      return handleForceDelete(id);
    }

    // Normal delete
    try {
      return await handleNormalDelete(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const details = (error as { details?: string })?.details || "";

      if (details.includes("job_history") || message.includes("job_history")) {
        return NextResponse.json(
          { error: "Cannot delete show: this show has job history. Shows with historical data can only be deactivated, not deleted." },
          { status: 400 }
        );
      }

      if (message.includes("jobs") || message.includes("launched")) {
        return NextResponse.json(
          { error: "Cannot delete show: jobs have been launched for this show. Use deactivate instead." },
          { status: 400 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("Show deletion failed:", error);
    return NextResponse.json({ error: "Show deletion failed" }, { status: 500 });
  }
}
