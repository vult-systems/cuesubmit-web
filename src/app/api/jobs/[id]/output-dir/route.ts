import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import fs from "fs/promises";
import path from "path";
import { Pool } from "pg";

const pool = new Pool({
  host: process.env.OPENCUE_DB_HOST || "localhost",
  port: parseInt(process.env.OPENCUE_DB_PORT || "5432"),
  database: process.env.OPENCUE_DB_NAME || "cuebot_local",
  user: process.env.OPENCUE_DB_USER || "cuebot",
  password: process.env.OPENCUE_DB_PASSWORD || "",
  max: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const RENDER_REPO_PATH =
  process.env.RENDER_REPO_PATH || "/mnt/RenderOutputRepo";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/jobs/[id]/output-dir
 *
 * Extracts the render output directory for an archived job by reading
 * the first RQD log file. The log file contains the full render command
 * including the -rd "outputPath" argument.
 *
 * Log files live at:
 *   <RENDER_REPO>/OpenCue/Logs/<show>/<shot>/logs/<jobName>--<jobId>/
 */
export async function GET(request: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: jobId } = await params;

  // Validate jobId is a UUID to prevent path traversal
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    // Get job metadata from job_history
    const result = await client.query(
      `SELECT jh.str_name, jh.str_shot, COALESCE(s.str_name, '') as show_name
       FROM job_history jh
       LEFT JOIN show s ON s.pk_show = jh.pk_show
       WHERE jh.pk_job = $1`,
      [jobId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Job not found in history" },
        { status: 404 }
      );
    }

    const { str_name: jobName, str_shot: shot, show_name: show } = result.rows[0];

    if (!show || !shot || !jobName) {
      return NextResponse.json(
        { error: "Incomplete job metadata" },
        { status: 404 }
      );
    }

    // Construct log directory path
    // Pattern: <RENDER_REPO>/OpenCue/Logs/<show>/<shot>/logs/<jobName>--<jobId>/
    const logDir = path.join(
      RENDER_REPO_PATH,
      "OpenCue",
      "Logs",
      show,
      shot,
      "logs",
      `${jobName}--${jobId}`
    );

    // Find and read the first .rqlog file
    let files: string[];
    try {
      files = await fs.readdir(logDir);
    } catch {
      return NextResponse.json(
        { error: "Log directory not accessible" },
        { status: 404 }
      );
    }

    const rqlog = files.find((f) => f.endsWith(".rqlog"));
    if (!rqlog) {
      return NextResponse.json(
        { error: "No log files found" },
        { status: 404 }
      );
    }

    // Read only the first ~2KB of the log file (the header with the command)
    const logPath = path.join(logDir, rqlog);
    const fd = await fs.open(logPath, "r");
    try {
      const buf = Buffer.alloc(2048);
      const { bytesRead } = await fd.read(buf, 0, 2048, 0);
      const header = buf.subarray(0, bytesRead).toString("utf-8");

      // Extract -rd "path" from the command line
      const rdMatch = header.match(/-rd\s+"([^"]+)"/);
      if (!rdMatch) {
        return NextResponse.json(
          { error: "Output directory not found in render command" },
          { status: 404 }
        );
      }

      return NextResponse.json({ outputDir: rdMatch[1] });
    } finally {
      await fd.close();
    }
  } catch (error) {
    console.error("Failed to get output directory:", error);
    return NextResponse.json(
      { error: "Failed to determine output directory" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
