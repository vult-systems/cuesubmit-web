import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getJobs, getShows, type Job } from "@/lib/opencue/gateway-client";
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

    // For completed tab, also fetch archived jobs from job_history + show list
    let allJobs = liveJobs;
    let allShows: string[] = [];
    if (includeFinished && config.mode === "online") {
      try {
        const [archived, showsResult] = await Promise.all([
          getJobHistory({ show, user: user_filter }),
          getShows().catch(() => ({ shows: [] })),
        ]);
        const archivedAsJobs: Job[] = archived
          .filter(a => !liveJobIds.has(a.id))
          .map(a => ({
            id: a.id,
            name: a.name,
            state: "FINISHED",
            isPaused: false,
            isArchived: true,
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
        // Gateway returns { shows: { shows: [...] } } or { shows: [...] }
        const rawShows = showsResult.shows;
        const showList = Array.isArray(rawShows) ? rawShows : (rawShows?.shows || []);
        allShows = showList.map((s: { name?: string }) => s.name).filter((n): n is string => Boolean(n));
      } catch (error) {
        console.error("Failed to fetch job history:", error);
      }
    }

    return NextResponse.json({ jobs: allJobs, shows: allShows });
  } catch (error) {
    console.error("Failed to fetch jobs:", error);
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}
