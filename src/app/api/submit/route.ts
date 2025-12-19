import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { launchSpec } from "@/lib/opencue/gateway-client";
import { buildJobSpec, type JobSpec } from "@/lib/opencue/spec-builder";

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

    // Build the job spec
    const jobSpec: JobSpec = {
      name: body.jobName,
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
