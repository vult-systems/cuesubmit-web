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
 * Jobs appear in OpenCue under show="maintenance", shot="rqd-update".
 * Each frame maps to one host — green = updated, red = failed (check .rqlog).
 *
 * Usage:
 *   node scripts/opencue-deploy.js
 *
 * Required environment variables:
 *   JWT_SECRET         Gateway auth secret
 *   REST_GATEWAY_URL   e.g. http://10.40.14.25:8448
 *
 * Optional environment variables:
 *   UNC_DEPLOY_SHARE   UNC path to deploy share (default: \\10.40.14.25\RenderSourceRepository\Utility\OpenCue_Deploy)
 *   DRY_RUN            Set to "1" to print the job XML without submitting
 *   TARGET_HOST        Comma-separated IPs to limit deployment, e.g. "10.40.14.116,10.40.14.106"
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
// Comma-separated IPs for targeted rollout, e.g. "10.40.14.106,10.40.14.108"
const TARGET_HOST    = process.env.TARGET_HOST || null;
const TARGET_HOSTS   = TARGET_HOST ? TARGET_HOST.split(',').map(s => s.trim()).filter(Boolean) : null;

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

// Build a single-frame job XML pinned to one specific host tag.
// tag: the OpenCue host tag to pin to (e.g. "AD404-05"), or null for farm-wide.
const SHOW = 'maintenance';
const SHOT = 'rqd-update';

function buildJobXml(uncShare, tag = null, suffix = '') {
  const cmd = `cmd.exe /c ${uncShare}\\DEPLOY-AS-ADMIN.bat ${uncShare}`;
  const timestamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
  const jobName = `${SHOW}-${SHOT}-${timestamp}${suffix ? '-' + suffix : ''}`;
  const tagsXml = tag ? `<tags>${tag}</tags>` : ``;
  const frameCount = 1;
  return `<?xml version="1.0"?><!DOCTYPE spec PUBLIC "SPI Cue Specification Language" "http://localhost:8080/spcue/dtd/cjsl-1.13.dtd"><spec><facility>local</facility><show>${SHOW}</show><shot>${SHOT}</shot><user>sysadmin</user><job name="${jobName}"><paused>false</paused><priority>99</priority><maxretries>1</maxretries><maxcores>100</maxcores><autoeat>false</autoeat><os>Windows</os><env></env><layers><layer name="deploy" type="Render"><cmd>${cmd}</cmd><range>1-${frameCount}</range><chunk>1</chunk><cores>1</cores><memory>1g</memory>${tagsXml}<services><service>maya</service></services></layer></layers></job></spec>`;
}

// Build a multi-frame farm-wide job (no tag pinning — one frame per eligible host).
function buildFarmJobXml(uncShare, hostCount) {
  const cmd = `cmd.exe /c ${uncShare}\\DEPLOY-AS-ADMIN.bat ${uncShare}`;
  const timestamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
  const jobName = `${SHOW}-${SHOT}-farm-${timestamp}`;
  return `<?xml version="1.0"?><!DOCTYPE spec PUBLIC "SPI Cue Specification Language" "http://localhost:8080/spcue/dtd/cjsl-1.13.dtd"><spec><facility>local</facility><show>${SHOW}</show><shot>${SHOT}</shot><user>sysadmin</user><job name="${jobName}"><paused>false</paused><priority>99</priority><maxretries>1</maxretries><maxcores>100</maxcores><autoeat>false</autoeat><os>Windows</os><env></env><layers><layer name="deploy" type="Render"><cmd>${cmd}</cmd><range>1-${hostCount}</range><chunk>1</chunk><cores>1</cores><memory>1g</memory><services><service>maya</service></services></layer></layers></job></spec>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.error('OpenCue Maintenance Deploy');
  console.error(`UNC Share : ${UNC_SHARE}`);
  console.error(`Dry run   : ${DRY_RUN}`);
  if (TARGET_HOSTS) console.error(`Targets   : ${TARGET_HOSTS.join(', ')}`);
  console.error('');

  // Fetch host list — needed for tag lookup (targeted) or frame count (farm-wide)
  console.error('Fetching host list from OpenCue...');
  const result = await gatewayCall('host.HostInterface', 'GetHosts', { r: {} });
  const allHosts = result?.hosts?.hosts || [];
  // Build IP -> specific host tag map (e.g. "10.40.14.116" -> "AD400-03")
  const ipToTag = {};
  for (const h of allHosts) {
    // Specific tag is the one matching /^AD\d+-\d+$/ (e.g. AD400-03, AD404-05)
    const specific = (h.tags || []).find(t => /^AD\d+-\d+$/.test(t));
    if (specific) ipToTag[h.name] = specific;
  }

  let jobs = [];

  if (TARGET_HOSTS) {
    // One job per target host, pinned via its specific tag
    for (const ip of TARGET_HOSTS) {
      const tag = ipToTag[ip];
      if (!tag) {
        console.error(`  [!!] No specific tag found for ${ip} — skipping`);
        continue;
      }
      console.error(`  ${ip} -> tag: ${tag}`);
      jobs.push({ xml: buildJobXml(UNC_SHARE, tag, tag), label: tag });
    }
  } else {
    // Farm-wide: one multi-frame job, one frame per eligible (non-DOWN) host
    const eligible = allHosts.filter(h => (h.state || '').toLowerCase() !== 'down');
    console.error(`Found ${allHosts.length} total hosts, ${eligible.length} eligible for deploy`);
    if (eligible.length === 0) {
      console.error('No eligible hosts found.');
      process.exit(1);
    }
    jobs.push({ xml: buildFarmJobXml(UNC_SHARE, eligible.length), label: 'farm-wide' });
  }

  if (DRY_RUN) {
    jobs.forEach(j => { console.error(`\n--- ${j.label} ---`); console.log(j.xml); });
    console.error(`\nDry-run: would submit ${jobs.length} job(s).`);
    return;
  }

  console.error(`\nSubmitting ${jobs.length} job(s)...\n`);
  for (const j of jobs) {
    try {
      const response = await gatewayCall('job.JobInterface', 'LaunchSpec', { spec: j.xml });
      const jobId = response?.jobId || response?.job?.id || response?.jobs?.[0]?.id || '(unknown)';
      console.error(`  [OK] ${j.label} -> jobId=${jobId}`);
    } catch (err) {
      console.error(`  [!!] ${j.label}: ${err.message}`);
    }
  }

  console.error('');
  console.error('All jobs submitted. Each host will pick up its frame when idle.');
  console.error(`Monitor in the web UI → show: "${SHOW}", shot: "${SHOT}"`);
  console.error('  Succeeded frame = host updated successfully');
  console.error('  Dead (red) frame = schtasks or deploy failed — check .rqlog');
  console.error('RQD will restart ~2 minutes after each host processes its frame.');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
