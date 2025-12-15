import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import {
  lockHost,
  unlockHost,
  rebootHost,
  rebootWhenIdleHost,
  addHostTags,
  removeHostTags,
  setHostAllocation,
  setHostHardwareState,
} from "@/lib/opencue/gateway-client";
import { config } from "@/lib/config";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action, tags, allocationId, state } = body;

    // Check permissions based on action
    if (["lock", "unlock"].includes(action)) {
      if (!hasPermission(user.role, "lock_hosts")) {
        return NextResponse.json({ error: "Permission denied" }, { status: 403 });
      }
    } else if (!hasPermission(user.role, "manage_hosts")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    // In offline mode, just return success (mock)
    if (config.mode === "offline") {
      return NextResponse.json({ success: true, message: `Mock: ${action} successful` });
    }

    switch (action) {
      case "lock":
        await lockHost(id);
        break;
      case "unlock":
        await unlockHost(id);
        break;
      case "reboot":
        await rebootHost(id);
        break;
      case "rebootWhenIdle":
        await rebootWhenIdleHost(id);
        break;
      case "addTags":
        if (!tags || !Array.isArray(tags)) {
          return NextResponse.json({ error: "Tags array required" }, { status: 400 });
        }
        await addHostTags(id, tags);
        break;
      case "removeTags":
        if (!tags || !Array.isArray(tags)) {
          return NextResponse.json({ error: "Tags array required" }, { status: 400 });
        }
        await removeHostTags(id, tags);
        break;
      case "setAllocation":
        if (!allocationId) {
          return NextResponse.json({ error: "Allocation ID required" }, { status: 400 });
        }
        await setHostAllocation(id, allocationId);
        break;
      case "setHardwareState":
        if (!state) {
          return NextResponse.json({ error: "State required" }, { status: 400 });
        }
        await setHostHardwareState(id, state);
        break;
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Host action failed:", error);
    // Include gateway error details if available
    let message = "Host action failed";
    let details = "";
    if (error instanceof Error) {
      message = error.message;
      // Check for GatewayError details
      if ("details" in error && typeof (error as { details?: string }).details === "string") {
        details = (error as { details: string }).details;
        console.error("Gateway details:", details);
      }
    }
    return NextResponse.json({ error: message, details }, { status: 500 });
  }
}
