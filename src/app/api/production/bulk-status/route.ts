import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  bulkUpdateStatus,
  isValidDepartment,
  isValidStatus,
  type Department,
  type Status,
} from "@/lib/db/production";

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // All authenticated users can update statuses

    const body = await request.json();
    const { shot_ids, department, status } = body;

    if (!Array.isArray(shot_ids) || shot_ids.length === 0) {
      return NextResponse.json({ error: "shot_ids must be a non-empty array" }, { status: 400 });
    }
    if (!department || !status) {
      return NextResponse.json({ error: "department and status are required" }, { status: 400 });
    }
    if (!isValidDepartment(department)) {
      return NextResponse.json({ error: "Invalid department" }, { status: 400 });
    }
    if (!isValidStatus(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const ids = shot_ids.map(Number).filter(n => !isNaN(n));
    bulkUpdateStatus(ids, department as Department, status as Status, user.username);

    return NextResponse.json({
      message: `Updated ${ids.length} shot(s) — ${department} → ${status}`,
      updated: ids.length,
    });
  } catch (error) {
    console.error("Failed to bulk update status:", error);
    return NextResponse.json({ error: "Failed to bulk update status" }, { status: 500 });
  }
}
