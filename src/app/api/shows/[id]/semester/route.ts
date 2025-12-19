import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getShowSemester, setShowSemester } from "@/lib/opencue/database";
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
    
    if (config.mode === "offline") {
      return NextResponse.json({ semester: null });
    }

    const semester = await getShowSemester(id);
    return NextResponse.json({ semester });
  } catch (error) {
    console.error("Failed to get show semester:", error);
    return NextResponse.json(
      { error: "Failed to get semester" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(user.role, "manage_shows")) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { semester } = body;

    if (config.mode === "offline") {
      return NextResponse.json({ success: true, semester });
    }

    await setShowSemester(id, semester || null);
    return NextResponse.json({ success: true, semester });
  } catch (error) {
    console.error("Failed to set show semester:", error);
    return NextResponse.json(
      { error: "Failed to set semester" },
      { status: 500 }
    );
  }
}
