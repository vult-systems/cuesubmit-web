import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getJobs } from "@/lib/opencue/gateway-client";

const DEPLOY_SHOW = "maintenance";
const DEPLOY_SHOT = "rqd-update";
const MAX_JOBS = 30;

/**
 * GET /api/admin/deploy/status
 * Returns recent maintenance/rqd-update jobs with frame stats.
 * Sorted newest-first. Limited to the last MAX_JOBS entries.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user.role, "manage_hosts")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Use substr filter to find maintenance-rqd-update jobs by name.
    // This works with include_finished and is more reliable than the shows filter.
    const nameSubstr = `${DEPLOY_SHOW}-${DEPLOY_SHOT}`;
    const { jobs } = await getJobs({ substr: nameSubstr, includeFinished: true });

    const namePrefix = `${DEPLOY_SHOW}-${DEPLOY_SHOT}-`;
    const deployJobs = jobs
      .filter((j) => j.name?.toLowerCase().startsWith(namePrefix))
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, MAX_JOBS)
      .map((j) => ({
        id: j.id,
        name: j.name,
        state: j.state,
        startTime: j.startTime,
        stopTime: j.stopTime,
        succeededFrames: j.succeededFrames,
        deadFrames: j.deadFrames,
        runningFrames: j.runningFrames,
        waitingFrames: j.waitingFrames,
        totalFrames: j.totalFrames,
        isPaused: j.isPaused,
      }));

    return NextResponse.json({ jobs: deployJobs });
  } catch (err) {
    console.error("deploy status GET error:", err);
    return NextResponse.json({ error: "Failed to fetch deploy status" }, { status: 500 });
  }
}
