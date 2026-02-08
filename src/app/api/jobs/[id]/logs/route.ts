import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getJob } from "@/lib/opencue/gateway-client";
import fs from "fs/promises";
import path from "path";

// Docker volume mount path (Linux container) or Windows UNC path
// In Docker: /angd_server_pool/renderRepo is mounted at /mnt/RenderOutputRepo
// On Windows dev: use UNC path \\REDACTED_IP\RenderOutputRepo
const RENDER_REPO_PATH = process.env.RENDER_REPO_PATH || "\\\\REDACTED_IP\\RenderOutputRepo";

/**
 * Convert the logDir from OpenCue (Linux path like /angd_server_pool/renderRepo/...)
 * to the local filesystem path based on the environment.
 */
function convertLogPath(logDir: string): string {
  // Replace the Linux source path with whatever our mount/UNC path is
  let converted = logDir.replace("/angd_server_pool/renderRepo", RENDER_REPO_PATH);
  
  // If we're on Linux (Docker), keep forward slashes
  // If we're on Windows, convert to backslashes
  if (process.platform === "win32") {
    converted = converted.replace(/\//g, "\\");
  } else {
    converted = converted.replace(/\\/g, "/");
  }
  
  return converted;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: jobId } = await params;
  const { searchParams } = new URL(request.url);
  const frameNumber = searchParams.get("frame");
  const layerName = searchParams.get("layer") || "render";

  try {
    // Get job info from gateway (uses JWT auth via gateway-client)
    const jobData = await getJob(jobId);
    const job = jobData.job || jobData;
    const logDir = job.logDir;
    const jobName = job.name || "";

    if (!logDir) {
      return NextResponse.json({
        error: "Log directory not found for job",
        logs: "Log directory not configured for this job.",
      }, { status: 404 });
    }

    // Convert Linux path to Windows UNC path
    const windowsLogDir = convertLogPath(logDir);

    // If a specific frame is requested, find and read its log file
    if (frameNumber) {
      const paddedFrame = frameNumber.padStart(4, "0");
      
      // Log file naming: jobname.XXXX-layername.rqlog or jobname.XXXX.rqlog
      // e.g., jobname.0001-arnold.rqlog or render.0001.rqlog
      const possibleLogPatterns = [
        `${jobName}.${paddedFrame}-${layerName}.rqlog`,
        `${jobName}.${paddedFrame}.rqlog`,
        `${layerName}.${paddedFrame}.rqlog`,
        `render.${paddedFrame}.rqlog`,
        `${paddedFrame}.rqlog`,
      ];

      // Try to read the log file
      for (const logFileName of possibleLogPatterns) {
        const logFilePath = path.join(windowsLogDir, logFileName);
        try {
          const logContent = await fs.readFile(logFilePath, "utf-8");
          return NextResponse.json({
            logs: logContent,
            logPath: logFilePath,
            source: "central",
          });
        } catch {
          // Try next pattern
          continue;
        }
      }

      // If no specific file found, try to list directory and find matching file
      try {
        const files = await fs.readdir(windowsLogDir);
        const matchingFile = files.find(f => 
          f.includes(`.${paddedFrame}`) && f.endsWith(".rqlog")
        );
        
        if (matchingFile) {
          const logFilePath = path.join(windowsLogDir, matchingFile);
          const logContent = await fs.readFile(logFilePath, "utf-8");
          return NextResponse.json({
            logs: logContent,
            logPath: logFilePath,
            source: "central",
          });
        }

        // No matching file found
        return NextResponse.json({
          error: "Log file not found",
          logs: `Log file not found for frame ${frameNumber}.\n\nSearched in: ${windowsLogDir}\n\nAvailable files:\n${files.filter(f => f.endsWith(".rqlog")).slice(0, 10).map(f => `  - ${f}`).join("\n")}\n\nThe frame may not have started rendering yet.`,
          logDir: windowsLogDir,
        });
      } catch {
        return NextResponse.json({
          error: "Could not read log directory",
          logs: `Could not access log directory:\n${windowsLogDir}\n\nThe job may not have started yet, or the directory is not accessible.`,
          logDir: windowsLogDir,
        });
      }
    }

    // If no frame specified, list available log files
    try {
      const files = await fs.readdir(windowsLogDir);
      const logFiles = files.filter(f => f.endsWith(".rqlog") || f.endsWith(".log"));
      
      return NextResponse.json({
        logDir: windowsLogDir,
        availableLogs: logFiles,
        logs: `Job: ${jobName}\n\nLog directory: ${windowsLogDir}\n\nAvailable log files (${logFiles.length}):\n${logFiles.slice(0, 20).map(f => `  - ${f}`).join("\n")}${logFiles.length > 20 ? `\n  ... and ${logFiles.length - 20} more` : ""}\n\nClick on a specific frame to view its log.`,
      });
    } catch {
      return NextResponse.json({
        error: "Could not read log directory",
        logs: `Could not access log directory:\n${windowsLogDir}\n\nThe job may not have started yet, or the directory is not accessible.`,
        logDir: windowsLogDir,
      });
    }
  } catch (error) {
    console.error("Failed to fetch logs:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to fetch logs",
      logs: `Error fetching logs: ${error instanceof Error ? error.message : "Unknown error"}`,
    }, { status: 500 });
  }
}
