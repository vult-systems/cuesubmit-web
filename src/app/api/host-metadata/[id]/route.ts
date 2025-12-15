import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { upsertHostMetadata, getHostMetadata } from "@/lib/db";

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
    const metadata = getHostMetadata(id);

    return NextResponse.json({ metadata: metadata || null });
  } catch (error) {
    console.error("Failed to fetch host metadata:", error);
    return NextResponse.json(
      { error: "Failed to fetch host metadata" },
      { status: 500 }
    );
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

    // Require at least manager role to update host metadata
    if (!hasPermission(user.role, "manage_hosts")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { display_id, system_name, notes } = body;

    const metadata = upsertHostMetadata(id, {
      display_id,
      system_name,
      notes,
    });

    return NextResponse.json({ success: true, metadata });
  } catch (error) {
    console.error("Failed to update host metadata:", error);
    return NextResponse.json(
      { error: "Failed to update host metadata" },
      { status: 500 }
    );
  }
}
