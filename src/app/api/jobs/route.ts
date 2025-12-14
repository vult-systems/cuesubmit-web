import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getJobs, type Job } from "@/lib/opencue/gateway-client";

// Helper to extract nested array from gateway response
function extractJobs(data: { jobs: Job[] } | Job[]): Job[] {
  if (Array.isArray(data)) return data;
  return data.jobs || [];
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const show = searchParams.get("show") || undefined;
    const user_filter = searchParams.get("user") || undefined;

    // Students can only see their own jobs
    const effectiveUser = user.role === "student" ? user.username : user_filter;

    const result = await getJobs({
      show,
      user: effectiveUser,
    });

    // Gateway returns { jobs: { jobs: [...] } }
    const jobs = extractJobs(result.jobs);
    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("Failed to fetch jobs:", error);
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}
