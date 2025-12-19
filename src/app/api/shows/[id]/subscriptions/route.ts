import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getShowSubscriptions, Subscription } from "@/lib/opencue/gateway-client";
import { config } from "@/lib/config";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Handle offline mode - return empty subscriptions
    if (config.mode === "offline") {
      return NextResponse.json({ subscriptions: [] });
    }

    // Online mode - fetch from OpenCue
    const response = await getShowSubscriptions(id);
    const subscriptions: Subscription[] = Array.isArray(response.subscriptions)
      ? response.subscriptions
      : response.subscriptions?.subscriptions || [];

    return NextResponse.json({ subscriptions });
  } catch (error) {
    console.error("Failed to fetch subscriptions:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscriptions" },
      { status: 500 }
    );
  }
}
