// Audit script to see what exists in OpenCue production
const crypto = require('crypto');

const GATEWAY_URL = process.env.REST_GATEWAY_URL || 'http://localhost:8448';
const JWT_SECRET = process.env.JWT_SECRET;

function createJWTToken(userId) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET required');
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { sub: userId, exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${headerB64}.${payloadB64}`).digest('base64url');
  return `${headerB64}.${payloadB64}.${sig}`;
}

async function gatewayCall(interfaceName, method, body = {}) {
  const url = `${GATEWAY_URL}/${interfaceName}/${method}`;
  const token = createJWTToken('audit-script');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status}: ${text}`);
  }
  return response.json();
}

async function main() {
  console.log('=== SHOWS ===');
  const showsResult = await gatewayCall('show.ShowInterface', 'GetShows', {});
  const shows = showsResult?.shows?.shows || showsResult?.shows || [];
  shows.forEach(s => console.log(`  ${s.name} (active: ${s.active})`));
  console.log(`Total: ${shows.length} shows\n`);

  console.log('=== ALLOCATIONS ===');
  const allocsResult = await gatewayCall('facility.AllocationInterface', 'GetAll', {});
  const allocs = allocsResult?.allocations?.allocations || allocsResult?.allocations || [];
  allocs.forEach(a => console.log(`  ${a.name} (tag: ${a.tag})`));
  console.log(`Total: ${allocs.length} allocations\n`);

  console.log('=== HOSTS ===');
  const hostsResult = await gatewayCall('host.HostInterface', 'GetHosts', {});
  const hosts = hostsResult?.hosts?.hosts || hostsResult?.hosts || [];
  
  // Group by allocation
  const byAlloc = {};
  hosts.forEach(h => {
    const alloc = h.allocName || 'unassigned';
    if (!byAlloc[alloc]) byAlloc[alloc] = [];
    byAlloc[alloc].push(h);
  });
  
  Object.keys(byAlloc).sort().forEach(alloc => {
    console.log(`  ${alloc}: ${byAlloc[alloc].length} hosts`);
  });
  
  // Show unique tags
  const allTags = new Set();
  hosts.forEach(h => (h.tags || []).forEach(t => allTags.add(t)));
  console.log(`\nUnique tags across all hosts: ${[...allTags].sort().join(', ')}`);
  console.log(`Total: ${hosts.length} hosts\n`);
}

main().catch(console.error);
