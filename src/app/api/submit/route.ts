import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { launchSpec, getJobs } from "@/lib/opencue/gateway-client";
import { buildJobSpec, type JobSpec } from "@/lib/opencue/spec-builder";

/**
 * Generate a unique job name by appending a version suffix if needed.
 * If "MyJob" exists, returns "MyJob_v02". If "MyJob_v02" exists, returns "MyJob_v03", etc.
 */
async function getUniqueJobName(baseName: string, show: string): Promise<string> {
  try {
    // Get existing jobs for this show
    const { jobs } = await getJobs({ show, includeFinished: true });

    // Find all jobs that match the base name pattern
    const baseNameLower = baseName.toLowerCase();
    const matchingJobs = jobs.filter(j => {
      const jobNameLower = j.name.toLowerCase();
      // Match exact name or name with version suffix (e.g., baseName_v02)
      return jobNameLower === baseNameLower ||
             jobNameLower.startsWith(baseNameLower + "_v");
    });

    if (matchingJobs.length === 0) {
      // No existing jobs with this name
      return baseName;
    }

    // Find the highest version number
    let maxVersion = 1;
    for (const job of matchingJobs) {
      const match = job.name.match(/_v(\d+)$/i);
      if (match) {
        const version = parseInt(match[1], 10);
        if (version >= maxVersion) {
          maxVersion = version + 1;
        }
      } else {
        // Base name without version exists, so we need at least v02
        maxVersion = Math.max(maxVersion, 2);
      }
    }

    // Return versioned name
    const versionStr = String(maxVersion).padStart(2, "0");
    return `${baseName}_v${versionStr}`;
  } catch (error) {
    console.warn("Failed to check for existing jobs, using base name:", error);
    // If we can't check, just use the base name (OpenCue will reject duplicates)
    return baseName;
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(user.role, "submit")) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Get unique job name (adds version suffix if name already exists)
    const uniqueJobName = await getUniqueJobName(body.jobName, body.show);
    console.log(`Job name: ${body.jobName} -> ${uniqueJobName}`);

    // Build the job spec
    const jobSpec: JobSpec = {
      name: uniqueJobName,
      show: body.show,
      shot: body.shot || "default",
      user: user.username,
      priority: body.priority || 100,
      maxRetries: body.maxRetries || 3,
      layers: body.layers.map((layer: {
        name: string;
        command: string;
        frameRange: string;
        chunk: number;
        cores: number;
        memoryGb: number;
        services?: string[];
        env?: Record<string, string>;
      }) => ({
        name: layer.name,
        command: layer.command,
        range: layer.frameRange,
        chunk: layer.chunk || 1,
        cores: layer.cores || 1,
        memory: layer.memoryGb || 4,
        services: layer.services,
        env: layer.env,
      })),
    };

    const specXml = buildJobSpec(jobSpec);
    console.log("Job spec XML:", specXml);
    const result = await launchSpec(specXml);

    return NextResponse.json({
      success: true,
      jobNames: result.names,
      message: `Job submitted successfully: ${result.names.join(", ")}`,
    });
  } catch (error) {
    console.error("Job submission failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Job submission failed" },
      { status: 500 }
    );
  }
}
