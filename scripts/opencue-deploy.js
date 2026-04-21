#!/usr/bin/env node
/**
 * opencue-deploy.js
 *
 * Submits a maintenance "deploy" job to OpenCue that runs UPDATE.bat on all
 * active render hosts. Each host gets one frame targeting it specifically,
 * so the update runs distributed across the farm without requiring admin
 * credentials or WinRM access.
 *
 * Prerequisites:
 *   - UPDATE.bat and source files must be published to the UNC deploy share
 *     (\\<server>\OpenCueDeploy\) before running this script.
 *   - All render hosts must already have the perforce credentials seeded
 *     (DEPLOY.bat handles this via cmdkey).
 *
 * Usage (run inside the Docker container):
 *   docker exec cuesubmit-web node /app/scripts/opencue-deploy.js
 *
 * Optional environment variables:
 *   UNC_DEPLOY_SHARE   UNC path to deploy share (default: \\10.40.14.25\OpenCueDeploy)
 *   DRY_RUN            Set to "1" to print the job XML without submitting
 *   TARGET_HOST        Override: only submit a job for this one host (for testing)
 */

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Gateway auth (same pattern as snapshot-jobs.js)
// ---------------------------------------------------------------------------
function createJWTToken(userId, expiryHours = 24) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set');
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + expiryHours * 3600,
    iat: Math.floor(Date.now() / 1000),
  };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest('base64url');
  return `${headerB64}.${payloadB64}.${sig}`;
}

const GATEWAY_URL = process.env.REST_GATEWAY_URL || 'http://127.0.0.1:8448';

async function gatewayCall(iface, method, body = {}) {
  const token = createJWTToken('cuesubmit-server');
  const url = `${GATEWAY_URL}/${iface}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gateway ${method}: ${res.status} ${await res.text()}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const UNC_SHARE       = process.env.UNC_DEPLOY_SHARE || '\\\\10.40.14.25\\RenderSourceRepository\\Utility\\OpenCue_Deploy';
const DRY_RUN        = process.env.DRY_RUN === '1';
const TARGET_HOST    = process.env.TARGET_HOST || null;

// Frame 0 (range 1-1 in OpenCue 1-based) acts as a setup/no-op barrier.
// Frame N (1..hostCount) each have host affinity to one specific render host.
//
// OpenCue job XML spec — Note:
//   <layer> requires: name, cmd, range, chunk, cores, memory
//   <depend>  can be used to sequence, but for a scatter job we want them all independent.
//   Host pinning is done via <job host="hostname"> at the frame level, HOWEVER
//   the OpenCue XML spec does not have per-frame host pinning in the DTD.
//
// The practical approach: submit one single-frame JOB per render host.
// Each job is named "opencue-deploy-<hostname>", show "maintenance", show alloc.
// This is how large-scale maintenance is typically done in OpenCue.

function buildJobXml(hostCount, uncShare) {
  // One frame per host. RQD dispatches one frame to each available machine.
  // UPDATE.bat is host-agnostic — it updates whichever machine runs it.
  // Must use the flat spec format + DOCTYPE so Cuebot's JDOM parser accepts it
  // RQD already has an SMB session to 10.40.14.25 for log output, so
  // 'net use /user:perforce' would fail with "multiple connections" error.
  // Call DEPLOY-AS-ADMIN.bat directly via UNC — the existing session covers it.
  // Perforce auth is handled inside the scheduled task (fresh logon session).
  const cmd = `cmd.exe /c ${uncShare}\\DEPLOY-AS-ADMIN.bat ${uncShare}`;
  const timestamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
  const jobName = `opencue-deploy-${timestamp}`;

  // Must use the flat spec format + DOCTYPE so Cuebot's JDOM parser accepts it
  // <tags> pins the job to hosts matching that OpenCue tag — remove for farm-wide rollout
  const tagsXml = TARGET_HOST ? `<tags>AD400-03</tags>` : ``;
  return `<?xml version="1.0"?><!DOCTYPE spec PUBLIC "SPI Cue Specification Language" "http://localhost:8080/spcue/dtd/cjsl-1.13.dtd"><spec><facility>local</facility><show>thesisii_s26</show><shot>default</shot><user>sysadmin</user><job name="${jobName}"><paused>false</paused><priority>99</priority><maxretries>1</maxretries><maxcores>100</maxcores><autoeat>false</autoeat><os>Windows</os><env></env><layers><layer name="update" type="Render"><cmd>${cmd}</cmd><range>1-${hostCount}</range><chunk>1</chunk><cores>1</cores><memory>1g</memory>${tagsXml}<services><service>maya</service></services></layer></layers></job></spec>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.error('OpenCue Maintenance Deploy');
  console.error(`UNC Share : ${UNC_SHARE}`);
  console.error(`Dry run   : ${DRY_RUN}`);
  if (TARGET_HOST) console.error(`Target    : ${TARGET_HOST} (single-host test mode)`);
  console.error('');

  // Get all render hosts from OpenCue to determine frame count
  let hostCount;
  if (TARGET_HOST) {
    hostCount = 1;
    console.error(`Target    : ${TARGET_HOST} (single-host test mode — 1 frame)`);
  } else {
    console.error('Fetching host list from OpenCue...');
    const result = await gatewayCall('host.HostInterface', 'GetHosts', { r: {} });
    const allHosts = result?.hosts?.hosts || [];

    // Only target hosts that are UP (not DOWN)
    const eligible = allHosts.filter(h => (h.state || '').toLowerCase() !== 'down');
    hostCount = eligible.length;

    console.error(`Found ${allHosts.length} total hosts, ${hostCount} eligible for deploy`);
    if (hostCount === 0) {
      console.error('No eligible hosts found. Check that render hosts are registered in OpenCue.');
      process.exit(1);
    }
  }

  const xml = buildJobXml(hostCount, UNC_SHARE);

  if (DRY_RUN) {
    console.log(xml);
    console.error(`\nDry-run: would submit 1 job with ${hostCount} frame(s).`);
    return;
  }

  console.error(`\nSubmitting 1 job with ${hostCount} frame(s)...\n`);

  try {
    const response = await gatewayCall('job.JobInterface', 'LaunchSpec', { spec: xml });
    const jobId = response?.jobId || response?.job?.id || response?.jobs?.[0]?.id || '(unknown)';
    console.error(`  [OK] jobId=${jobId}`);
  } catch (err) {
    console.error(`  [!!] ${err.message}`);
    process.exit(1);
  }

  console.error('');
  console.error('All jobs submitted. Each host will pick up its frame when idle.');
  console.error('Monitor progress in the web UI under the "maintenance" show.');
  console.error('RQD will restart ~2 minutes after each host processes its frame.');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
