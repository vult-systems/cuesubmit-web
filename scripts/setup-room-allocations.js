// Setup script to create room allocations
// Run this once from the server: node scripts/setup-room-allocations.js

const GATEWAY_URL = process.env.REST_GATEWAY_URL || 'http://localhost:8448';

const rooms = ['AD400', 'AD404', 'AD405', 'AD406', 'AD407', 'AD415'];

async function createAllocation(name, tag, facility = 'local') {
  const url = `${GATEWAY_URL}/facility.AllocationInterface/Create`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
