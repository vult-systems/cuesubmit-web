import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getJobs, type Job } from "@/lib/opencue/gateway-client";
import { config } from "@/lib/config";
import { 
  SHOWS, 
  PROJECT_CODES, 
  SCOPES, 
  DEPARTMENTS, 
  RENDER_TYPES, 
  USERS, 
  ASSETS, 
  SHOTS,
  JOB_STATES,
  randomItem,
  type Scope
} from "@/lib/mock-data";

// Helper to extract nested array from gateway response
function extractJobs(data: { jobs: Job[] } | Job[]): Job[] {
  if (Array.isArray(data)) return data;
  return data.jobs || [];
}

// Mock jobs for offline mode - uses centralized mock data
function generateMockJobs(): Job[] {
  const jobs: Job[] = [];
  
  for (let i = 0; i < 50; i++) {
    const showObj = randomItem(SHOWS);
    const projectCode = randomItem(PROJECT_CODES);
    const scope = randomItem(SCOPES) as Scope;
    const department = randomItem(DEPARTMENTS);
    const subject = scope === "asset" 
      ? randomItem(ASSETS)
      : randomItem(SHOTS);
    const renderType = randomItem(RENDER_TYPES);
    const user = randomItem(USERS);
    const version = `v${String(Math.floor(Math.random() * 20) + 1).padStart(2, "0")}`;
    
    // Build job name using shorthand tag
    const jobName = `${showObj.tag}_${projectCode}_${scope}_${department}_${subject}_${renderType}_${user}_${version}`;
    
    // State distribution: 40% FINISHED, 25% RUNNING, 25% PENDING, 10% DEAD
    const stateRoll = Math.random();
    const state = stateRoll > 0.6 ? "FINISHED" : stateRoll > 0.35 ? "RUNNING" : stateRoll > 0.1 ? "PENDING" : "DEAD";
    
    // Generate frame stats based on state
    const totalFrames = Math.floor(Math.random() * 200) + 50;
    let succeededFrames = 0;
    let runningFrames = 0;
    let pendingFrames = 0;
    let deadFrames = 0;
    
    if (state === "FINISHED") {
      succeededFrames = totalFrames;
    } else if (state === "RUNNING") {
      succeededFrames = Math.floor(totalFrames * Math.random() * 0.7);
      runningFrames = Math.floor(Math.random() * 10) + 1;
      pendingFrames = totalFrames - succeededFrames - runningFrames;
    } else if (state === "PENDING") {
      pendingFrames = totalFrames;
    } else if (state === "DEAD") {
      deadFrames = Math.floor(totalFrames * 0.3);
      succeededFrames = Math.floor(totalFrames * 0.5);
      pendingFrames = totalFrames - deadFrames - succeededFrames;
    }
    
    const startTime = Date.now() - Math.floor(Math.random() * 86400000 * 7); // Up to 7 days ago
    const stopTime = state === "FINISHED" || state === "DEAD" 
      ? startTime + Math.floor(Math.random() * 7200000) // 0-2 hours after start
      : 0;
    
    jobs.push({
      id: `job-${String(i + 1).padStart(3, "0")}`,
      name: jobName,
      state,
      show: showObj.name,
      user,
      priority: Math.floor(Math.random() * 100) + 1,
      isPaused: Math.random() > 0.9,
      startTime,
      stopTime,
      totalFrames,
      succeededFrames,
      runningFrames,
      pendingFrames,
      deadFrames
    });
  }
  
  return jobs;
}

const MOCK_JOBS: Job[] = generateMockJobs();

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Return mock data in offline mode
    if (config.mode === "offline") {
      const filtered = user.role === "student" 
        ? MOCK_JOBS.filter(j => j.user === user.username)
        : MOCK_JOBS;
      return NextResponse.json({ jobs: filtered });
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
