import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, type Role } from "@/lib/auth/permissions";
import {
  getAllShots,
  createShot,
  isValidShotCode,
  isValidPriority,
  type Priority,
} from "@/lib/db/production";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const act_id = searchParams.get("act_id");
    const priority = searchParams.get("priority");
    const department = searchParams.get("department");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const shots = getAllShots({
      act_id: act_id ? Number(act_id) : undefined,
      priority: priority && isValidPriority(priority) ? priority as Priority : undefined,
      department: department || undefined,
      status: status || undefined,
      search: search || undefined,
    } as Parameters<typeof getAllShots>[0]);

    return NextResponse.json({ shots });
  } catch (error) {
    console.error("Failed to fetch shots:", error);
    return NextResponse.json({ error: "Failed to fetch shots" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(user.role as Role, "manage_productions")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { act_id, code, frame_start, frame_end, priority, notes } = body;

    if (!act_id || !code) {
      return NextResponse.json({ error: "act_id and code are required" }, { status: 400 });
    }
    if (!isValidShotCode(code)) {
      return NextResponse.json({ error: "Shot code must match format shot## (e.g. shot01)" }, { status: 400 });
    }
    if (priority && !isValidPriority(priority)) {
      return NextResponse.json({ error: `Invalid priority. Must be one of: low, medium, high, critical` }, { status: 400 });
    }

    const shot = createShot({
      act_id: Number(act_id),
      code,
      frame_start: frame_start ? Number(frame_start) : undefined,
      frame_end: frame_end ? Number(frame_end) : undefined,
      priority,
      notes,
    });

    return NextResponse.json({ shot }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create shot";
    const status = message.includes("UNIQUE") ? 409 : 500;
    console.error("Failed to create shot:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
