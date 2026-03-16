import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getJobs, type Job } from "@/lib/opencue/gateway-client";
import { getJobHistory } from "@/lib/opencue/database";
import { config } from "@/lib/config";

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

    // Fetch live jobs from gateway
    const result = await getJobs({
      show,
      user: user_filter,
      includeFinished,
    });

    const liveJobs: Job[] = result.jobs || [];
    const liveJobIds = new Set(liveJobs.map(j => j.id));

    // For finished/all tabs, also fetch archived jobs from job_history
    let allJobs = liveJobs;
    if (includeFinished && config.mode === "online") {
      try {
        const archived = await getJobHistory({ show, user: user_filter });
        const archivedAsJobs: Job[] = archived
          .filter(a => !liveJobIds.has(a.id))
          .map(a => ({
            id: a.id,
            name: a.name,
            state: "FINISHED",
            isPaused: false,
            user: a.user,
            show: a.show,
            shot: a.shot,
            priority: 0,
            startTime: a.startTime,
            stopTime: a.stopTime,
            pendingFrames: 0,
            runningFrames: a.runningFrames,
            deadFrames: a.deadFrames,
            succeededFrames: a.succeededFrames,
            eatenFrames: a.eatenFrames,
            waitingFrames: a.waitingFrames,
            dependFrames: a.dependFrames,
            totalFrames: a.totalFrames,
          }));
        allJobs = [...liveJobs, ...archivedAsJobs];
      } catch (error) {
        console.error("Failed to fetch job history:", error);
        // Fall back to live jobs only
      }
    }

    return NextResponse.json({ jobs: allJobs });
  } catch (error) {
    console.error("Failed to fetch jobs:", error);
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}
