import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getHosts, launchSpec } from "@/lib/opencue/gateway-client";

const UNC_SHARE = "\\\\10.40.14.25\\RenderSourceRepository\\Utility\\OpenCue_Deploy";
const SHOW = "maintenance";
const SHOT = "rqd-update";
const SHOT_DIAGNOSE = "rqd-diagnose";
const AD_TAG_RE = /^AD\d+-\d+$/;

const HOST_STATES: Record<number, string> = { 0: "UP", 1: "DOWN", 2: "REPAIR", 3: "UNKNOWN" };
const LOCK_STATES: Record<number, string> = { 0: "OPEN", 1: "LOCKED", 2: "NIMBY_LOCKED" };

function toState(v?: string | number): string {
  if (v === undefined || v === null) return "UNKNOWN";
  if (typeof v === "number") return HOST_STATES[v] ?? "UNKNOWN";
  return String(v).toUpperCase();
}

function toLockState(v?: string | number): string {
  if (v === undefined || v === null) return "UNKNOWN";
  if (typeof v === "number") return LOCK_STATES[v] ?? "UNKNOWN";
  return String(v).toUpperCase();
}

/**
 * Build a single-frame job XML pinned to the given host tag.
 * One job per host so each host is explicitly targeted and trackable.
 */
function buildJobXml(tag: string, mode: "deploy" | "diagnose" = "deploy"): string {
  const shot = mode === "diagnose" ? SHOT_DIAGNOSE : SHOT;
  const cmd = mode === "diagnose"
    ? `cmd.exe /c ${UNC_SHARE}\\DIAGNOSE.bat`
    : `cmd.exe /c ${UNC_SHARE}\\DEPLOY-AS-ADMIN.bat ${UNC_SHARE}`;
  const timestamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
  const jobName = `${SHOW}-${shot}-${timestamp}-${tag}`;
  return (
    `<?xml version="1.0"?>` +
    `<!DOCTYPE spec PUBLIC "SPI Cue Specification Language" "http://localhost:8080/spcue/dtd/cjsl-1.13.dtd">` +
    `<spec><facility>local</facility><show>${SHOW}</show><shot>${shot}</shot>` +
    `<user>sysadmin</user><job name="${jobName}">` +
    `<paused>false</paused><priority>99</priority><maxretries>1</maxretries>` +
    `<maxcores>100</maxcores><autoeat>false</autoeat><os>Windows</os><env></env>` +
    `<layers><layer name="deploy" type="Render">` +
    `<cmd>${cmd}</cmd>` +
    `<range>1-1</range><chunk>1</chunk><cores>1</cores><memory>1g</memory>` +
    `<tags>${tag}</tags><services><service>maya</service></services>` +
    `</layer></layers></job></spec>`
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractRawHosts(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (data?.hosts) {
    if (Array.isArray(data.hosts)) return data.hosts;
    if (Array.isArray(data.hosts?.hosts)) return data.hosts.hosts;
  }
  return [];
}

export interface DeployHost {
  id: string;
  name: string;       // IP address (OpenCue host name)
  specificTag: string; // e.g. "AD404-05"
  room: string;        // e.g. "AD404"
  state: string;       // UP / DOWN / REPAIR / UNKNOWN
  lockState: string;   // OPEN / LOCKED / NIMBY_LOCKED
  tags: string[];
}

/**
 * GET /api/admin/deploy
 * Returns all render farm hosts that have an AD-style tag (AD###-##).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user.role, "manage_hosts")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const raw = await getHosts();
    const rawHosts = extractRawHosts(raw);

    const hosts: DeployHost[] = rawHosts
      .map((h) => {
        const tags: string[] = h.tags ?? [];
        const specificTag = tags.find((t: string) => AD_TAG_RE.test(t));
        if (!specificTag) return null;

        // Room is the part before the last dash, e.g. "AD404" from "AD404-05"
        const room = specificTag.replace(/-\d+$/, "");

        return {
          id: h.id ?? h.name,
          name: h.name,
          specificTag,
          room,
          state: toState(h.state),
          lockState: toLockState(h.lock_state ?? h.lockState),
          tags,
        } as DeployHost;
      })
      .filter(Boolean) as DeployHost[];

    // Sort by room then by host number
    hosts.sort((a, b) => a.specificTag.localeCompare(b.specificTag));

    return NextResponse.json({ hosts });
  } catch (err) {
    console.error("deploy GET error:", err);
    return NextResponse.json({ error: "Failed to fetch hosts" }, { status: 500 });
  }
}

/**
 * POST /api/admin/deploy
 * Body: { targets: string[] }  — array of IP addresses to deploy to.
 *        Pass an empty array to get a validation error, omit for all.
 *
 * Submits one OpenCue job per target host to the maintenance/rqd-update show.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user.role, "manage_hosts")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { targets?: string[]; mode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const targets = body?.targets;
  if (!Array.isArray(targets) || targets.length === 0) {
    return NextResponse.json({ error: "targets must be a non-empty array of IPs" }, { status: 400 });
  }

  const mode: "deploy" | "diagnose" = body?.mode === "diagnose" ? "diagnose" : "deploy";

  // Fetch all hosts to build IP → tag map
  const ipToTag: Record<string, string> = {};
  try {
    const raw = await getHosts();
    const rawHosts = extractRawHosts(raw);
    for (const h of rawHosts) {
      const tags: string[] = h.tags ?? [];
      const specificTag = tags.find((t: string) => AD_TAG_RE.test(t));
      if (specificTag) ipToTag[h.name] = specificTag;
    }
  } catch (err) {
    console.error("deploy POST — getHosts error:", err);
    return NextResponse.json({ error: "Failed to fetch host list" }, { status: 500 });
  }

  const submitted: { label: string; names: string[] }[] = [];
  const errors: { label: string; error: string }[] = [];

  for (const ip of targets) {
    const tag = ipToTag[ip];
    if (!tag) {
      errors.push({ label: ip, error: "No AD tag found — host not registered or not a farm host" });
      continue;
    }

    const xml = buildJobXml(tag, mode);
    try {
      const result = await launchSpec(xml);
      submitted.push({ label: tag, names: result?.names ?? [] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ label: tag, error: message });
    }
  }

  const status = errors.length > 0 && submitted.length === 0 ? 500 : 200;
  return NextResponse.json({ submitted, errors }, { status });
}
