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
} from "@/lib/opencue/gateway-client";
import { forceDeleteShow, renameShow } from "@/lib/opencue/database";
import { config } from "@/lib/config";
import { getOfflineShows, setOfflineShows } from "@/lib/offline-shows";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only admins and managers can manage shows
    if (!hasPermission(user.role, "manage_shows")) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { action, value } = body;

    // Handle offline mode
    if (config.mode === "offline") {
      const shows = getOfflineShows();
      const showIndex = shows.findIndex(s => s.id === id);
      
      if (showIndex === -1) {
        return NextResponse.json(
          { error: "Show not found" },
          { status: 404 }
        );
      }

      switch (action) {
        case "activate":
          shows[showIndex].active = true;
          break;
        case "deactivate":
          shows[showIndex].active = false;
          break;
        case "rename":
          if (!value || typeof value !== "string") {
            return NextResponse.json(
              { error: "New name is required" },
              { status: 400 }
            );
          }
          // Check for duplicate name (excluding current show)
          if (shows.some(s => s.id !== id && s.name.toLowerCase() === value.trim().toLowerCase())) {
            return NextResponse.json(
              { error: "A show with this name already exists" },
              { status: 400 }
            );
          }
          shows[showIndex].name = value.trim();
          break;
        case "setMinCores":
          if (typeof value !== "number" || value < 0) {
            return NextResponse.json(
              { error: "Invalid min cores value" },
              { status: 400 }
            );
          }
          shows[showIndex].defaultMinCores = value;
          break;
        case "setMaxCores":
          if (typeof value !== "number" || value < 0) {
            return NextResponse.json(
              { error: "Invalid max cores value" },
              { status: 400 }
            );
          }
          shows[showIndex].defaultMaxCores = value;
          break;
        default:
          return NextResponse.json(
            { error: "Unknown action" },
            { status: 400 }
          );
      }

      setOfflineShows(shows);
      return NextResponse.json({ success: true, show: shows[showIndex] });
    }

    // Online mode
    switch (action) {
      case "activate":
        await setShowActive(id, true);
        break;
      case "deactivate":
        await setShowActive(id, false);
        break;
      case "rename":
        if (!value || typeof value !== "string") {
          return NextResponse.json(
            { error: "New name is required" },
            { status: 400 }
          );
        }
        const renameResult = await renameShow(id, value.trim());
        if (!renameResult.success) {
          return NextResponse.json(
            { error: renameResult.error || "Failed to rename show" },
            { status: 400 }
          );
        }
        break;
      case "setMinCores":
        if (typeof value !== "number" || value < 0) {
          return NextResponse.json(
            { error: "Invalid min cores value" },
            { status: 400 }
          );
        }
        await setShowDefaultMinCores(id, value);
        break;
      case "setMaxCores":
        if (typeof value !== "number" || value < 0) {
          return NextResponse.json(
            { error: "Invalid max cores value" },
            { status: 400 }
          );
        }
        await setShowDefaultMaxCores(id, value);
        break;
      default:
        return NextResponse.json(
          { error: "Unknown action" },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Show action failed:", error);
    return NextResponse.json(
      { error: "Show action failed" },
      { status: 500 }
    );
  }
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

    // Only admins can delete shows
    if (user.role !== "admin") {
      return NextResponse.json(
        { error: "Only administrators can delete shows" },
        { status: 403 }
      );
    }

    const { id } = await params;
    
    // Check for force delete parameter
    const url = new URL(request.url);
    const forceDelete = url.searchParams.get("force") === "true";

    // Handle offline mode
    if (config.mode === "offline") {
      const shows = getOfflineShows();
      const showIndex = shows.findIndex(s => s.id === id);
      
      if (showIndex === -1) {
        return NextResponse.json(
          { error: "Show not found" },
          { status: 404 }
        );
      }

      shows.splice(showIndex, 1);
      setOfflineShows(shows);
      return NextResponse.json({ success: true });
    }

    // Force delete - directly delete from database including job history
    if (forceDelete) {
      console.log(`Force deleting show ${id} including job history...`);
      const result = await forceDeleteShow(id);
      
      if (result.success) {
        console.log(`Force deleted show ${id}: ${result.deletedJobs} jobs, ${result.deletedSubscriptions} subscriptions`);
        return NextResponse.json({ 
          success: true,
          deletedJobs: result.deletedJobs,
          deletedSubscriptions: result.deletedSubscriptions,
        });
      } else {
        return NextResponse.json(
          { error: result.error || "Force delete failed" },
          { status: 500 }
        );
      }
    }

    // Normal delete - first delete all subscriptions via API, then delete the show
    try {
      // Get all subscriptions for this show
      const subscriptionsResponse = await getShowSubscriptions(id);
      const subscriptions = Array.isArray(subscriptionsResponse.subscriptions)
        ? subscriptionsResponse.subscriptions
        : subscriptionsResponse.subscriptions?.subscriptions || [];
      
      // Delete each subscription
      for (const subscription of subscriptions) {
        try {
          await deleteSubscription(subscription.id);
          console.log(`Deleted subscription: ${subscription.name || subscription.id}`);
        } catch (subError) {
          console.error(`Failed to delete subscription ${subscription.id}:`, subError);
          // Continue trying to delete other subscriptions
        }
      }
      
      // Now delete the show
      await deleteShow(id);
      return NextResponse.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const details = (error as { details?: string })?.details || "";
      
      // Check for job history constraint - show has had jobs run
      if (details.includes("job_history") || message.includes("job_history")) {
        return NextResponse.json(
          { error: "Cannot delete show: this show has job history. Shows with historical data can only be deactivated, not deleted." },
          { status: 400 }
        );
      }
      
      // If the show has had jobs, OpenCue will reject the deletion
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
    return NextResponse.json(
      { error: "Show deletion failed" },
      { status: 500 }
    );
  }
}
