import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getJobs } from "@/lib/opencue/gateway-client";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const show = searchParams.get("show") || undefined;
    const user_filter = searchParams.get("user") || undefined;
    const includeFinished = searchParams.get("includeFinished") === "true";

    // Students can only see their own jobs
    const effectiveUser = user.role === "student" ? user.username : user_filter;

    const result = await getJobs({
      show,
      user: effectiveUser,
      includeFinished,
    });

    return NextResponse.json({ jobs: result.jobs });
  } catch (error) {
    console.error("Failed to fetch jobs:", error);
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}
