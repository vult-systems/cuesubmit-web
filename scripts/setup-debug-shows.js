// Setup script to create debug shows for each room
// Run: JWT_SECRET=your-secret node scripts/setup-debug-shows.js

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

async function gatewayCall(interfaceName, method, body) {
  const url = `${GATEWAY_URL}/${interfaceName}/${method}`;
  const token = createJWTToken('setup-script');
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status}: ${text}`);
  }
  
  return response.json();
}

async function createShow(name) {
  try {
    const result = await gatewayCall('show.ShowInterface', 'CreateShow', { name });
    console.log(`Created show: ${name}`);
    return result.show;
  } catch (error) {
    if (error.message.includes('already exists') || error.message.includes('duplicate')) {
      console.log(`Show ${name} already exists, fetching...`);
      const result = await gatewayCall('show.ShowInterface', 'FindShow', { name });
      return result.show;
    }
    console.error(`Failed to create show ${name}:`, error.message);
    return null;
  }
}

async function findAllocation(name) {
  try {
    const result = await gatewayCall('facility.AllocationInterface', 'Find', { name: `local.${name}` });
    return result.allocation;
  } catch (error) {
    console.error(`Failed to find allocation ${name}:`, error.message);
    return null;
  }
}

async function createSubscription(showId, allocationId, size = 0, burst = 100) {
  try {
    await gatewayCall('show.ShowInterface', 'CreateSubscription', {
      show: { id: showId },
      allocation_id: allocationId,
      size: size,
      burst: burst,
    });
    console.log(`  - Created subscription to allocation`);
    return true;
  } catch (error) {
    if (error.message.includes('already exists') || error.message.includes('duplicate')) {
      console.log(`  - Subscription already exists`);
      return true;
    }
    console.error(`  - Failed to create subscription:`, error.message);
    return false;
  }
}

async function main() {
  if (!JWT_SECRET) {
    console.error('Error: JWT_SECRET environment variable is required');
    process.exit(1);
  }
  
  console.log('Creating debug shows for each room...');
  console.log(`Gateway URL: ${GATEWAY_URL}`);
  console.log('');
  
  for (const room of rooms) {
    const showName = `DEBUG_${room}`;
    const allocName = room.toLowerCase();
    
    console.log(`\nSetting up ${showName}...`);
    
    // Create the show
    const show = await createShow(showName);
    if (!show) continue;
    
    // Find the room allocation
    const allocation = await findAllocation(allocName);
    if (!allocation) {
      console.log(`  - Allocation local.${allocName} not found, skipping subscription`);
      continue;
    }
    
    // Create subscription to the room allocation
    await createSubscription(show.id, allocation.id, 0, 100);
  }
  
  console.log('\n');
  console.log('Done! Debug shows created:');
  rooms.forEach(room => console.log(`  - DEBUG_${room} → local.${room.toLowerCase()}`));
}

main();
