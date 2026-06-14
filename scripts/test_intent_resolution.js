import axios from 'axios';

const API = process.env.API_BASE_URL || 'http://localhost:5000';
const client = axios.create({ baseURL: API, timeout: 30000 });

const queries = [
  { name: 'India (Country)', body: { city: 'India' } },
  { name: 'Tamil Nadu (State)', body: { city: 'Tamil Nadu' } },
  { name: 'Salem (Ambiguous City)', body: { city: 'Salem' } },
  { name: 'Tirunelveli (OpenWeather Geocoding Fallback)', body: { city: 'Tirunelveli' } },
  { name: 'Hebbal (Locality)', body: { city: 'Hebbal' } },
  { name: 'Delhi Technological University (Station)', body: { city: 'Delhi Technological University' } }
];

async function run() {
  console.log(`=======================================================`);
  console.log(`Running Search Intent Resolution & Metadata Verification`);
  console.log(`Targeting backend API: ${API}`);
  console.log(`=======================================================\n`);

  for (const q of queries) {
    console.log(`Testing Query: "${q.body.city}" (${q.name})`);
    try {
      const res = await client.post('/api/hybrid-measurements', q.body);
      const data = res.data;
      
      console.log(`  -> HTTP Status: ${res.status}`);
      console.log(`  -> Search Context Level: ${data.searchContext?.level}`);
      console.log(`  -> Resolved Location: ${data.resolvedLocation}`);
      console.log(`  -> Provider Location: ${data.providerLocation}`);
      console.log(`  -> Primary Source: ${data.source}`);
      console.log(`  -> Total Measurements: ${data.count}`);
      console.log(`  -> Total Stations: ${data.stations?.length || 0}`);
      
      if (data.stations && data.stations.length > 0) {
        console.log(`  -> Stations Found (top 3):`);
        data.stations.slice(0, 3).forEach((s, idx) => {
          console.log(`     [${idx + 1}] Name: "${s.resolvedLocation}"`);
          console.log(`         Coordinates: ${JSON.stringify(s.coordinates)}`);
          console.log(`         Confidence: ${s.stationMetadata?.confidence}`);
          console.log(`         AQI/Snapshot: ${JSON.stringify(s.snapshot)}`);
        });
      } else {
        console.log(`  -> Snapshot: ${JSON.stringify(data.snapshot)}`);
      }
      
      console.log(`  -> Legacy Station Metadata: ${JSON.stringify(data.stationMetadata)}`);
      console.log(`-------------------------------------------------------\n`);
    } catch (err) {
      console.error(`  ❌ Failed for "${q.body.city}":`, err.response?.data?.error || err.message);
      console.log(`-------------------------------------------------------\n`);
    }
  }
}

run().catch(err => {
  console.error('Fatal execution error:', err.message);
  process.exit(1);
});
