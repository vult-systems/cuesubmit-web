import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getFrames, type Frame } from "@/lib/opencue/gateway-client";
import { config } from "@/lib/config";
import { randomHostName } from "@/lib/mock-data";

// Helper to extract nested array from gateway response
function extractFrames(data: { frames: Frame[] } | Frame[]): Frame[] {
  if (Array.isArray(data)) return data;
  return data.frames || [];
}

// Mock frames for offline mode - uses centralized mock data
// Frames are grouped into chunks that run on the same host
function getMockFrames(jobId: string): Frame[] {
  const numFrames = jobId === "job-001" ? 100 : 50;
  
  // Random chunk size per job (1, 5, 10, or 20 frames per chunk)
  const chunkSizes = [1, 5, 10, 20];
  // Simple hash based on string characters
  const hash = jobId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const chunkSize = chunkSizes[Math.abs(hash) % chunkSizes.length] || 10;
  
  // Pre-generate host assignments per chunk
  const numChunks = Math.ceil(numFrames / chunkSize);
  const chunkHosts: string[] = [];
  const chunkCores: number[] = [];
  const chunkStates: string[] = [];
  const chunkStartTimes: number[] = [];
  const chunkStopTimes: number[] = [];
  
  for (let c = 0; c < numChunks; c++) {
    chunkHosts.push(randomHostName());
    // Random cores per chunk: 1, 2, 4, 8, or 16
    const coreOptions = [1, 2, 4, 8, 16];
    chunkCores.push(coreOptions[Math.floor(Math.random() * coreOptions.length)]);
    
    // Chunk state distribution: 70% SUCCEEDED, 10% RUNNING, 15% WAITING, 5% DEAD
    const stateRoll = Math.random();
    chunkStates.push(
      stateRoll < 0.7 ? "SUCCEEDED" 
      : stateRoll < 0.8 ? "RUNNING" 
      : stateRoll < 0.95 ? "WAITING" 
      : "DEAD"
    );
    
    // Timing for the chunk
    const startTime = Date.now() - Math.floor(Math.random() * 7200000); // Up to 2 hours ago
    chunkStartTimes.push(startTime);
    const isCompleted = chunkStates[c] === "SUCCEEDED" || chunkStates[c] === "DEAD";
    chunkStopTimes.push(isCompleted ? startTime + Math.floor(Math.random() * 1800000) : 0);
  }
  
  return Array.from({ length: numFrames }, (_, i) => {
    const frameNum = i + 1;
    const chunkIndex = Math.floor(i / chunkSize);
    const state = chunkStates[chunkIndex];
    const isCompleted = state === "SUCCEEDED" || state === "DEAD";
    const hostWithCores = state !== "WAITING" 
      ? chunkHosts[chunkIndex].replace("/1.0", `/${chunkCores[chunkIndex]}.0`)
      : "";
    
    return {
      id: `${jobId}-frame-${frameNum}`,
      name: `frame-${String(frameNum).padStart(4, '0')}`,
      number: frameNum,
      state,
      retryCount: state === "DEAD" ? Math.floor(Math.random() * 3) + 1 : 0,
      exitStatus: state === "SUCCEEDED" ? 0 : state === "DEAD" ? 1 : -1,
      maxRss: Math.floor(Math.random() * 4000000000),
      usedMemory: Math.floor(Math.random() * 4000000000),
      startTime: state !== "WAITING" ? chunkStartTimes[chunkIndex] : 0,
      stopTime: isCompleted ? chunkStopTimes[chunkIndex] : 0,
      lastResource: hostWithCores,
      chunkNumber: chunkIndex + 1,
      chunkSize,
    };
  });
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

    // Return mock data in offline mode
    if (config.mode === "offline") {
      const frames = getMockFrames(id);
      return NextResponse.json({ frames });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "100");

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
