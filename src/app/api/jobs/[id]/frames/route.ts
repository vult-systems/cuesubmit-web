import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getFrames, type Frame } from "@/lib/opencue/gateway-client";

// Helper to extract nested array from gateway response
function extractFrames(data: { frames: Frame[] } | Frame[]): Frame[] {
  if (Array.isArray(data)) return data;
  return data.frames || [];
}

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

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "1000");

    const result = await getFrames(id, { page, limit });

    // Gateway returns { frames: { frames: [...] } }
    const frames = extractFrames(result.frames);
    return NextResponse.json({ frames });
  } catch (error) {
    console.error("Failed to fetch frames:", error);
    return NextResponse.json(
      { error: "Failed to fetch frames" },
      { status: 500 }
    );
  }
}
