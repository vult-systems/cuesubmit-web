// Script to remove redundant lowercase room tags from hosts
// Keeps uppercase tags (AD405), removes lowercase duplicates (ad405)
const crypto = require('crypto');

const GATEWAY_URL = process.env.REST_GATEWAY_URL || 'http://localhost:8448';
const JWT_SECRET = process.env.JWT_SECRET;

// Tags to remove (lowercase room tags - redundant)
const TAGS_TO_REMOVE = ['ad400', 'ad404', 'ad405', 'ad406', 'ad407', 'ad415'];

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
  const token = createJWTToken('cleanup-script');
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
  console.log('Fetching hosts...');
  const hostsResult = await gatewayCall('host.HostInterface', 'GetHosts', {});
  const hosts = hostsResult?.hosts?.hosts || hostsResult?.hosts || [];
  
  console.log(`Found ${hosts.length} hosts\n`);
  
  let totalRemoved = 0;
  
  for (const host of hosts) {
    const tags = host.tags || [];
    const tagsToRemove = tags.filter(t => TAGS_TO_REMOVE.includes(t.toLowerCase()) && t === t.toLowerCase());
    
    if (tagsToRemove.length > 0) {
      console.log(`${host.name}: Removing tags [${tagsToRemove.join(', ')}]`);
      try {
        await gatewayCall('host.HostInterface', 'RemoveTags', {
          host: { id: host.id },
          tags: tagsToRemove
        });
        totalRemoved += tagsToRemove.length;
      } catch (err) {
        console.error(`  Error: ${err.message}`);
      }
    }
  }
  
  console.log(`\nDone! Removed ${totalRemoved} redundant tags.`);
}

main().catch(console.error);
