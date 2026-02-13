import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getShotById,
  updateDepartmentStatus,
  isValidDepartment,
  isValidStatus,
  type Department,
  type Status,
} from "@/lib/db/production";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // All authenticated users (admin, manager, student) can update statuses

    const { id } = await params;
    const shotId = Number(id);
    const body = await request.json();
    const { department, status, assignee } = body;

    if (!department || !status) {
      return NextResponse.json({ error: "department and status are required" }, { status: 400 });
    }
    if (!isValidDepartment(department)) {
      return NextResponse.json({ error: `Invalid department. Must be one of: lookdev, blocking, spline, polish, lighting, rendering, comp` }, { status: 400 });
    }
    if (!isValidStatus(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: not-started, in-progress, review, revision, approved, final, omit` }, { status: 400 });
    }

    const shot = getShotById(shotId);
    if (!shot) {
      return NextResponse.json({ error: "Shot not found" }, { status: 404 });
    }

    const result = updateDepartmentStatus(
      shotId,
      department as Department,
      status as Status,
      user.username,
      assignee,
    );

    return NextResponse.json({ status: result });
  } catch (error) {
    console.error("Failed to update status:", error);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}
