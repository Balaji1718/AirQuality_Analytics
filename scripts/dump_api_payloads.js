import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API = 'http://localhost:5000';
const client = axios.create({ baseURL: API, timeout: 30000 });

const queries = [
  { file: 'payload_country.json', body: { city: 'India' } },
  { file: 'payload_state.json', body: { city: 'Tamil Nadu' } },
  { file: 'payload_city_ambiguous.json', body: { city: 'Salem' } },
  { file: 'payload_city_fallback.json', body: { city: 'Tirunelveli' } },
  { file: 'payload_locality.json', body: { city: 'Hebbal' } },
  { file: 'payload_station.json', body: { city: 'Delhi Technological University' } }
];

async function run() {
  const artifactsDir = path.join(__dirname, '../artifacts');
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  for (const q of queries) {
    try {
      console.log(`Fetching payload for: ${q.body.city}`);
      const res = await client.post('/api/hybrid-measurements', q.body);
      
      // We will save a trimmed/pretty version of the response to avoid huge files
      // containing thousands of historical rows, keeping the structure intact
      const payload = res.data;
      const trimmed = {
        city: payload.city,
        resolvedLocation: payload.resolvedLocation,
        resolvedCoordinates: payload.resolvedCoordinates,
        providerLocation: payload.providerLocation,
        stationMetadata: payload.stationMetadata,
        searchContext: payload.searchContext,
        from: payload.from,
        to: payload.to,
        source: payload.source,
        count: payload.count,
        snapshot: payload.snapshot,
        localAdvice: payload.localAdvice,
        apiInfo: payload.apiInfo,
        stationsCount: payload.stations?.length || 0,
        // Include first station details and sample of 1 measurement for inspectability
        stationsSample: (payload.stations || []).slice(0, 2).map(s => ({
          stationId: s.stationId,
          resolvedLocation: s.resolvedLocation,
          coordinates: s.coordinates,
          stationMetadata: s.stationMetadata,
          snapshot: s.snapshot,
          measurementsCount: s.measurements?.length || 0
        })),
        resultsSample: (payload.results || []).slice(0, 2)
      };

      const outPath = path.join(artifactsDir, q.file);
      fs.writeFileSync(outPath, JSON.stringify(trimmed, null, 2), 'utf8');
      console.log(`Saved ${q.file}`);
    } catch (err) {
      console.error(`Failed to fetch for ${q.body.city}:`, err.message);
    }
  }
}

run();
