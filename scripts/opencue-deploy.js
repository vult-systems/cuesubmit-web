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

function buildJobXml(hostname, uncShare) {
  // The frame command runs UPDATE.bat from the UNC share.
  // cmd.exe is used so that the service account can resolve UNC paths.
  const cmd = `cmd.exe /c net use ${uncShare} /user:perforce uiw3d >nul 2>&1 && ${uncShare}\\UPDATE.bat ${uncShare}`;

  // Safe job name (OpenCue: lowercase, alphanumeric + hyphen, max 255)
  const safeName = `opencue-deploy-${hostname.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;

  return `<?xml version="1.0"?>
<spec>
  <shows>
    <show>
      <name>maintenance</name>
    </show>
  </shows>
  <jobs>
    <job name="${safeName}" priority="99" paused="false">
      <show>maintenance</show>
      <shot>deploy</shot>
      <user>sysadmin</user>
      <facility>local</facility>
      <layers>
        <layer name="update" type="Render">
          <cmd>${cmd.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</cmd>
          <range>1-1</range>
          <chunk>1</chunk>
          <cores>1</cores>
          <memory>512m</memory>
          <tags>
            <tag>${hostname.split('.')[0].toUpperCase()}</tag>
          </tags>
          <timeout>300</timeout>
          <timeout_llu>300</timeout_llu>
        </layer>
      </layers>
    </job>
  </jobs>
</spec>`;
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

  // Get all render hosts from OpenCue
  let hosts;
  if (TARGET_HOST) {
    hosts = [TARGET_HOST];
  } else {
    console.error('Fetching host list from OpenCue...');
    const result = await gatewayCall('host.HostInterface', 'GetHosts', { r: {} });
    const allHosts = result?.hosts?.hosts || [];

    // Only target hosts that are OPEN or NIMBY_LOCKED (not manually LOCKED or DOWN)
    hosts = allHosts
      .filter(h => {
        const lock = (h.lockState || '').toLowerCase();
        const state = (h.state || '').toLowerCase();
        return state !== 'down' && lock !== 'locked';
      })
      .map(h => h.name);

    console.error(`Found ${allHosts.length} total hosts, ${hosts.length} eligible for deploy`);
    if (hosts.length === 0) {
      console.error('No eligible hosts found. Check that render hosts are registered in OpenCue.');
      process.exit(1);
    }
  }

  console.error(`\nSubmitting deploy job to ${hosts.length} host(s):\n`);

  const results = { submitted: 0, failed: 0, dryRun: 0 };

  for (const hostname of hosts) {
    const xml = buildJobXml(hostname, UNC_SHARE);

    if (DRY_RUN) {
      console.log(`\n--- Job XML for ${hostname} ---`);
      console.log(xml);
      results.dryRun++;
      continue;
    }

    try {
      const response = await gatewayCall('job.JobInterface', 'SubmitJob', {
        spec: xml,
      });
      const jobId = response?.jobId || response?.job?.id || '(unknown)';
      console.error(`  [OK] ${hostname.padEnd(40)} jobId=${jobId}`);
      results.submitted++;
    } catch (err) {
      console.error(`  [!!] ${hostname.padEnd(40)} ${err.message}`);
      results.failed++;
    }

    // Small delay to avoid hammering the gateway
    await new Promise(r => setTimeout(r, 100));
  }

  console.error('');
  console.error(`Submitted : ${results.submitted}`);
  if (DRY_RUN) console.error(`Dry-run   : ${results.dryRun}`);
  if (results.failed > 0) {
    console.error(`Failed    : ${results.failed}`);
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
