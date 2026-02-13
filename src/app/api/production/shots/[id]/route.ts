import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, type Role } from "@/lib/auth/permissions";
import {
  getShotById,
  updateShot,
  deleteShot,
  isValidShotCode,
  isValidPriority,
} from "@/lib/db/production";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const shot = getShotById(Number(id));
    if (!shot) {
      return NextResponse.json({ error: "Shot not found" }, { status: 404 });
    }

    return NextResponse.json({ shot });
  } catch (error) {
    console.error("Failed to fetch shot:", error);
    return NextResponse.json({ error: "Failed to fetch shot" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(user.role as Role, "manage_productions")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    if (body.code && !isValidShotCode(body.code)) {
      return NextResponse.json({ error: "Shot code must match format shot## (e.g. shot01)" }, { status: 400 });
    }
    if (body.priority && !isValidPriority(body.priority)) {
      return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
    }

    const shot = updateShot(Number(id), body);
    if (!shot) {
      return NextResponse.json({ error: "Shot not found" }, { status: 404 });
    }

    return NextResponse.json({ shot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update shot";
    console.error("Failed to update shot:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(user.role as Role, "manage_productions")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const shot = getShotById(Number(id));
    if (!shot) {
      return NextResponse.json({ error: "Shot not found" }, { status: 404 });
    }

    deleteShot(Number(id));
    return NextResponse.json({ message: `Deleted shot ${shot.combined_code}` });
  } catch (error) {
    console.error("Failed to delete shot:", error);
    return NextResponse.json({ error: "Failed to delete shot" }, { status: 500 });
  }
}
