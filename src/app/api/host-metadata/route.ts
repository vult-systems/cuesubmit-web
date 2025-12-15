import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getAllHostMetadata } from "@/lib/db";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const metadata = getAllHostMetadata();
    return NextResponse.json({ metadata });
  } catch (error) {
    console.error("Failed to fetch host metadata:", error);
    return NextResponse.json(
      { error: "Failed to fetch host metadata" },
      { status: 500 }
    );
  }
}
