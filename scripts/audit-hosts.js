// Check host details
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
  const hostsResult = await gatewayCall('host.HostInterface', 'GetHosts', {});
  const hosts = hostsResult?.hosts?.hosts || hostsResult?.hosts || [];
  
  // Show hosts by allocation with their tags
  const byAlloc = {};
  hosts.forEach(h => {
    const alloc = h.allocName || 'unassigned';
    if (!byAlloc[alloc]) byAlloc[alloc] = { hosts: [], tags: new Set() };
    byAlloc[alloc].hosts.push(h.name);
    (h.tags || []).forEach(t => byAlloc[alloc].tags.add(t));
  });
  
  console.log('=== HOSTS BY ALLOCATION WITH TAGS ===\n');
  Object.keys(byAlloc).sort().forEach(alloc => {
    console.log(`${alloc}:`);
    console.log(`  Count: ${byAlloc[alloc].hosts.length}`);
    console.log(`  Tags: ${[...byAlloc[alloc].tags].sort().join(', ')}`);
    console.log(`  Hosts: ${byAlloc[alloc].hosts.slice(0,3).join(', ')}${byAlloc[alloc].hosts.length > 3 ? '...' : ''}`);
    console.log('');
  });
}

main().catch(console.error);
