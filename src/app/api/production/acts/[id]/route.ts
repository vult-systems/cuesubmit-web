import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, type Role } from "@/lib/auth/permissions";
import { getActById, updateAct, deleteAct, getActShotCount, isValidActCode } from "@/lib/db/production";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const act = getActById(Number(id));
    if (!act) {
      return NextResponse.json({ error: "Act not found" }, { status: 404 });
    }

    return NextResponse.json({ act });
  } catch (error) {
    console.error("Failed to fetch act:", error);
    return NextResponse.json({ error: "Failed to fetch act" }, { status: 500 });
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

    if (body.code && !isValidActCode(body.code)) {
      return NextResponse.json({ error: "Act code must match format act## (e.g. act01)" }, { status: 400 });
    }

    const act = updateAct(Number(id), body);
    if (!act) {
      return NextResponse.json({ error: "Act not found" }, { status: 404 });
    }

    return NextResponse.json({ act });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update act";
    console.error("Failed to update act:", error);
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
    const numId = Number(id);
    const act = getActById(numId);
    if (!act) {
      return NextResponse.json({ error: "Act not found" }, { status: 404 });
    }

    const shotCount = getActShotCount(numId);
    const result = deleteAct(numId);

    return NextResponse.json({
      message: `Deleted act ${act.code}${result.shotsDeleted > 0 ? ` and ${result.shotsDeleted} shot(s)` : ""}`,
      shotsDeleted: shotCount,
    });
  } catch (error) {
    console.error("Failed to delete act:", error);
    return NextResponse.json({ error: "Failed to delete act" }, { status: 500 });
  }
}
