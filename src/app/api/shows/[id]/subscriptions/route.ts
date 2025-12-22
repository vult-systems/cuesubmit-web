import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getShowSubscriptions,
  createSubscription,
  setSubscriptionSize,
  setSubscriptionBurst,
  deleteSubscription,
  Subscription,
} from "@/lib/opencue/gateway-client";
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

// Create a new subscription
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only admins and managers can manage subscriptions
    if (user.role !== "admin" && user.role !== "manager") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: showId } = await params;
    const body = await request.json();
    const { allocationId, size = 0, burst = 100 } = body;

    if (!allocationId) {
      return NextResponse.json(
        { error: "Allocation ID is required" },
        { status: 400 }
      );
    }

    if (config.mode === "offline") {
      return NextResponse.json({ error: "Cannot create subscriptions in offline mode" }, { status: 400 });
    }

    const response = await createSubscription(showId, allocationId, size, burst);
    return NextResponse.json({ subscription: response.subscription });
  } catch (error) {
    console.error("Failed to create subscription:", error);
    const message = error instanceof Error ? error.message : "Failed to create subscription";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Update or delete a subscription
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== "admin" && user.role !== "manager") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await params; // Consume params even though we don't need showId here
    const body = await request.json();
    const { subscriptionId, size, burst } = body;

    if (!subscriptionId) {
      return NextResponse.json(
        { error: "Subscription ID is required" },
        { status: 400 }
      );
    }

    if (config.mode === "offline") {
      return NextResponse.json({ error: "Cannot update subscriptions in offline mode" }, { status: 400 });
    }

    // Update size if provided
    if (size !== undefined) {
      await setSubscriptionSize(subscriptionId, size);
    }

    // Update burst if provided
    if (burst !== undefined) {
      await setSubscriptionBurst(subscriptionId, burst);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update subscription:", error);
    const message = error instanceof Error ? error.message : "Failed to update subscription";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Delete a subscription
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== "admin" && user.role !== "manager") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await params; // Consume params
    const { searchParams } = new URL(request.url);
    const subscriptionId = searchParams.get("subscriptionId");

    if (!subscriptionId) {
      return NextResponse.json(
        { error: "Subscription ID is required" },
        { status: 400 }
      );
    }

    if (config.mode === "offline") {
      return NextResponse.json({ error: "Cannot delete subscriptions in offline mode" }, { status: 400 });
    }

    await deleteSubscription(subscriptionId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete subscription:", error);
    const message = error instanceof Error ? error.message : "Failed to delete subscription";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
