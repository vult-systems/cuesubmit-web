import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { killJob, pauseJob, resumeJob, retryFrames, eatFrames, getJob } from "@/lib/opencue/gateway-client";

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
    const job = await getJob(id);

    return NextResponse.json({ job });
  } catch (error) {
    console.error("Failed to fetch job:", error);
    return NextResponse.json(
      { error: "Failed to fetch job" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action, frameIds } = body;

    // Check permissions based on action
    const permissionMap: Record<string, Permission> = {
      kill: "kill",
      pause: "pause",
      resume: "pause",
      retry: "retry",
      eat: "eat",
    };

    const requiredPermission = permissionMap[action];
    if (!requiredPermission || !hasPermission(user.role, requiredPermission)) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    let result;
    switch (action) {
      case "kill":
        result = await killJob(id, user.username);
        break;
      case "pause":
        result = await pauseJob(id);
        break;
      case "resume":
        result = await resumeJob(id);
        break;
      case "retry":
        result = await retryFrames(id, frameIds);
        break;
      case "eat":
        result = await eatFrames(id, frameIds);
        break;
      default:
        return NextResponse.json(
          { error: "Unknown action" },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("Job action failed:", error);
    return NextResponse.json(
      { error: "Job action failed" },
      { status: 500 }
    );
  }
}
