import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import {
  setShowActive,
  setShowDefaultMinCores,
  setShowDefaultMaxCores,
} from "@/lib/opencue/gateway-client";

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

    switch (action) {
      case "activate":
        await setShowActive(id, true);
        break;
      case "deactivate":
        await setShowActive(id, false);
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
