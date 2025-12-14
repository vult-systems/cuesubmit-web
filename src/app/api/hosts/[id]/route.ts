import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { lockHost, unlockHost } from "@/lib/opencue/gateway-client";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(user.role, "lock_hosts")) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case "lock":
        await lockHost(id);
        break;
      case "unlock":
        await unlockHost(id);
        break;
      default:
        return NextResponse.json(
          { error: "Unknown action" },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Host action failed:", error);
    return NextResponse.json(
      { error: "Host action failed" },
      { status: 500 }
    );
  }
}
