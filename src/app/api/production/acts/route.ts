import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, type Role } from "@/lib/auth/permissions";
import { getAllActs, createAct, isValidActCode } from "@/lib/db/production";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const acts = getAllActs();
    return NextResponse.json({ acts });
  } catch (error) {
    console.error("Failed to fetch acts:", error);
    return NextResponse.json({ error: "Failed to fetch acts" }, { status: 500 });
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
    const { code, name, sort_order } = body;

    if (!code || !name) {
      return NextResponse.json({ error: "Code and name are required" }, { status: 400 });
    }
    if (!isValidActCode(code)) {
      return NextResponse.json({ error: "Act code must match format act## (e.g. act01, act02)" }, { status: 400 });
    }

    const act = createAct(code, name, sort_order);
    return NextResponse.json({ act }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create act";
    const status = message.includes("UNIQUE") ? 409 : 500;
    console.error("Failed to create act:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
