import axios from 'axios';
import fs from 'fs';
import path from 'path';

const API_BASE = 'http://localhost:5000';
const client = axios.create({ baseURL: API_BASE, timeout: 30000 });

const locations = [
  // India (Multi-source, OpenAQ primary, WAQI fallback, DB historical)
  { name: 'Delhi', body: { city: 'Delhi', country: 'India', state: 'Delhi' } },
  { name: 'Mumbai', body: { city: 'Mumbai', country: 'India', state: 'Maharashtra' } },
  { name: 'Bengaluru', body: { city: 'Bengaluru', country: 'India', state: 'Karnataka' } },
  { name: 'Chennai', body: { city: 'Chennai', country: 'India', state: 'Tamil Nadu' } },
  { name: 'Kolkata', body: { city: 'Kolkata', country: 'India', state: 'West Bengal' } },
  { name: 'Pune', body: { city: 'Pune', country: 'India', state: 'Maharashtra' } },
  { name: 'Hyderabad', body: { city: 'Hyderabad', country: 'India', state: 'Telangana' } },
  { name: 'Jaipur', body: { city: 'Jaipur', country: 'India', state: 'Rajasthan' } },

  // US (OpenAQ, WAQI, OpenWeather)
  { name: 'New York', body: { city: 'New York', country: 'United States', state: 'New York' } },
  { name: 'Los Angeles', body: { city: 'Los Angeles', country: 'United States', state: 'California' } },
  { name: 'Chicago', body: { city: 'Chicago', country: 'United States', state: 'Illinois' } },
  { name: 'Houston', body: { city: 'Houston', country: 'United States', state: 'Texas' } },
  { name: 'San Francisco', body: { city: 'San Francisco', country: 'United States', state: 'California' } },

  // UK (OpenAQ, WAQI)
  { name: 'London', body: { city: 'London', country: 'United Kingdom' } },
  { name: 'Birmingham', body: { city: 'Birmingham', country: 'United Kingdom' } },
  { name: 'Manchester', body: { city: 'Manchester', country: 'United Kingdom' } },

  // Australia (OpenAQ, WAQI)
  { name: 'Sydney', body: { city: 'Sydney', country: 'Australia' } },
  { name: 'Melbourne', body: { city: 'Melbourne', country: 'Australia' } },

  // Canada (OpenAQ, WAQI)
  { name: 'Toronto', body: { city: 'Toronto', country: 'Canada' } },
  { name: 'Vancouver', body: { city: 'Vancouver', country: 'Canada' } },

  // Brazil (WAQI, OpenWeather)
  { name: 'São Paulo', body: { city: 'São Paulo', country: 'Brazil' } },
  { name: 'Rio de Janeiro', body: { city: 'Rio de Janeiro', country: 'Brazil' } },

  // China (WAQI, OpenWeather)
  { name: 'Beijing', body: { city: 'Beijing', country: 'China' } },
  { name: 'Shanghai', body: { city: 'Shanghai', country: 'China' } },

  // Japan (WAQI, OpenWeather)
  { name: 'Tokyo', body: { city: 'Tokyo', country: 'Japan' } }
];

async function runSweep() {
  console.log(`========================================================`);
  console.log(`STARTING REAL-WORLD VALIDATION SWEEP (25 LOCATIONS)`);
  console.log(`========================================================\n`);

  const results = [];

  for (const loc of locations) {
    process.stdout.write(`Querying ${loc.name}... `);
    try {
      const res = await client.post('/api/hybrid-measurements', loc.body);
      const data = res.data;

      if (data.empty) {
        console.log(`EMPTY`);
        results.push({
          locationName: loc.name,
          body: loc.body,
          empty: true,
          error: data.message
        });
        continue;
      }

      const provider = data.source;
      const stations = data.stations || [];
      const totalStationsReturned = stations.length;
      const primaryStation = stations.find(s => s.resolvedLocation === data.resolvedLocation) || stations[0];

      // Extract details
      const resolvedLocation = data.resolvedLocation;
      const coordinates = data.resolvedCoordinates;
      const stationMetadata = data.stationMetadata || {};
      
      // Extract AQI values from primary station snapshot
      const snapshot = data.snapshot || [];
      const pm25 = snapshot.find(s => s.pollutant === 'pm25' || s.pollutant === 'pm2.5')?.value ?? null;
      const pm10 = snapshot.find(s => s.pollutant === 'pm10')?.value ?? null;
      const no2 = snapshot.find(s => s.pollutant === 'no2')?.value ?? null;

      // Check for preservation issues:
      // 1. Station averaging (ensure snapshot values match primary station's raw measurements values)
      let stationAveragingDetected = false;
      if (primaryStation && primaryStation.measurements) {
        const rawPm25 = primaryStation.measurements.find(m => m.pollutant === 'pm25' || m.pollutant === 'pm2.5')?.value ?? null;
        if (rawPm25 !== null && pm25 !== null && Math.abs(rawPm25 - pm25) > 0.01) {
          stationAveragingDetected = true;
        }
      }

      // 2. Metadata loss (ensure ID and coordinates are present)
      const metadataLossDetected = !stationMetadata.stationId || !coordinates;

      // 3. Cross-city contamination (ensure resolved location or station name does not mention a completely different known city)
      let crossCityContamination = false;
      const knownCities = ['Delhi', 'Mumbai', 'Bengaluru', 'Chennai', 'Kolkata', 'Pune', 'Hyderabad', 'Jaipur', 'New York', 'London', 'Tokyo'];
      for (const city of knownCities) {
        if (loc.name !== city && (resolvedLocation.includes(city) || (stationMetadata.stationName || '').includes(city))) {
          // Exception: country-level or state queries that resolve to a main city, but here we query specific cities
          crossCityContamination = true;
        }
      }

      console.log(`PASS (${provider}, ${totalStationsReturned} stations preserved)`);

      results.push({
        locationName: loc.name,
        body: loc.body,
        empty: false,
        provider,
        totalStationsReturned,
        resolvedLocation,
        coordinates,
        stationMetadata,
        aqiValues: { pm25, pm10, no2 },
        stationAveragingDetected,
        metadataLossDetected,
        crossCityContamination,
        hierarchyBehavior: data.searchContext || {}
      });

    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      console.log(`FAIL: ${errorMsg}`);
      results.push({
        locationName: loc.name,
        body: loc.body,
        error: errorMsg
      });
    }
  }

  // Write results to JSON
  fs.writeFileSync('scripts/sweep_results.json', JSON.stringify(results, null, 2));
  console.log(`\nSweep complete! Written to scripts/sweep_results.json`);
}

runSweep();
