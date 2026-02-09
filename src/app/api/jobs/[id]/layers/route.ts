import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getLayers, type Layer } from "@/lib/opencue/gateway-client";

// Helper to extract nested array from gateway response
function extractLayers(data: { layers: Layer[] } | Layer[]): Layer[] {
  if (Array.isArray(data)) return data;
  return data.layers || [];
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
    const result = await getLayers(id);

    // Gateway returns { layers: { layers: [...] } }
    const layers = extractLayers(result.layers);

    return NextResponse.json({ layers });
  } catch (error) {
    console.error("Failed to fetch layers:", error);
    return NextResponse.json(
      { error: "Failed to fetch layers" },
      { status: 500 }
    );
  }
}
