// Setup script to create room allocations
// Run this once from the server: JWT_SECRET=your-secret node scripts/setup-room-allocations.js

const crypto = require('crypto');

const GATEWAY_URL = process.env.REST_GATEWAY_URL || 'http://localhost:8448';
const JWT_SECRET = process.env.JWT_SECRET;

const rooms = ['AD400', 'AD404', 'AD405', 'AD406', 'AD407', 'AD415'];

function createJWTToken(userId, expiryHours = 24) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + expiryHours * 3600,
    iat: Math.floor(Date.now() / 1000),
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const message = `${headerB64}.${payloadB64}`;
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(message)
    .digest('base64url');

  return `${message}.${signature}`;
}

async function createAllocation(name, tag, facility = 'local') {
  const url = `${GATEWAY_URL}/facility.AllocationInterface/Create`;
  const token = createJWTToken('setup-script');
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        name,
        tag,
        facility: { name: facility }
      }),
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.error(`Failed to create ${name}:`, response.status, text);
      return null;
    }
    
    const result = await response.json();
    console.log(`Created allocation: ${name} (tag: ${tag})`);
    return result;
  } catch (error) {
    console.error(`Error creating ${name}:`, error.message);
    return null;
  }
}

async function main() {
  if (!JWT_SECRET) {
    console.error('Error: JWT_SECRET environment variable is required');
    console.error('Usage: JWT_SECRET=your-secret node scripts/setup-room-allocations.js');
    process.exit(1);
  }
  
  console.log('Creating room allocations...');
  console.log(`Gateway URL: ${GATEWAY_URL}`);
  console.log('');
  
  for (const room of rooms) {
    const name = room.toLowerCase();
    const tag = room.toLowerCase();
    await createAllocation(name, tag);
  }
  
  console.log('');
  console.log('Done! Now you can assign hosts to these allocations.');
}

main();
