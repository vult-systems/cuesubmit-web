import { NextResponse } from "next/server";

const P4_SYNC_URL = "http://127.0.0.1:5005/sync";
const P4_AUTH_TOKEN = "uiw3d";

export async function POST() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(P4_SYNC_URL, {
      method: "POST",
      headers: { "X-Auth": P4_AUTH_TOKEN },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "P4 sync failed",
          details: data.stderr || data.stdout || "Unknown error",
          exitCode: data.exit_code,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      message: "P4 sync completed successfully",
      stdout: data.stdout,
      exitCode: data.exit_code,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: "P4 sync timed out after 60 seconds" },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: "Failed to connect to P4 sync service" },
      { status: 503 }
    );
  }
}
