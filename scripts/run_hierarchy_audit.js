import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.join(__dirname, '../server/.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false
});

// India bounding box
const isWithinIndiaBounds = (lat, lon) => {
  return lat >= 6 && lat <= 37.5 && lon >= 68 && lon <= 98;
};

// Major countries bounding boxes (rough guides)
const COUNTRY_BOUNDS = {
  'India': { minLat: 6, maxLat: 37.5, minLon: 68, maxLon: 98 },
  'United States': { minLat: 24, maxLat: 49, minLon: -125, maxLon: -66 },
  'United Kingdom': { minLat: 49, maxLat: 61, minLon: -9, maxLon: 2 },
  'Canada': { minLat: 41, maxLat: 83, minLon: -141, maxLon: -52 },
  'Australia': { minLat: -44, maxLat: -10, minLon: 112, maxLon: 154 }
};

const stationKeywords = [
  'cpcb', 'dpcc', 'spcb', 'aqms', 'monitor', 'station', 'university', 'school',
  'technological', 'institute', 'hospital', 'airport', 'residential', 'industrial',
  'high school', 'metro', 'government', 'office', 'building', 'chowk', 'vihar', 'nagar'
];

async function run() {
  console.log('Connecting to database...');
  const client = await pool.connect();
  
  try {
    console.log('Fetching hierarchy tables...');
    
    // Fetch countries
    const countriesRes = await client.query('SELECT * FROM aqi_countries ORDER BY country_name');
    const countries = countriesRes.rows;
    
    // Fetch states
    const statesRes = await client.query('SELECT * FROM aqi_states');
    const states = statesRes.rows;
    
    // Fetch cities
    const citiesRes = await client.query('SELECT * FROM aqi_cities');
    const cities = citiesRes.rows;
    
    console.log(`Fetched ${countries.length} countries, ${states.length} states, ${cities.length} cities.`);
    
    const countriesMap = new Map(countries.map(c => [c.id, c]));
    const statesMap = new Map(states.map(s => [s.id, s]));
    
    const auditData = [];
    const syntheticStates = [];
    const contaminatedCities = [];
    const lowCoverageCountries = [];
    
    for (const country of countries) {
      const countryStates = states.filter(s => s.country_id === country.id);
      const countryCities = cities.filter(c => c.country_id === country.id);
      
      let contaminationCount = 0;
      let countryContaminatedCities = [];
      let countrySyntheticStates = [];
      
      // 1. Synthetic/Fallback/Unknown states check
      for (const state of countryStates) {
        const nameLower = state.state_name.toLowerCase();
        if (
          nameLower.includes('unknown') ||
          nameLower.includes('general') ||
          nameLower.includes('synthetic') ||
          nameLower.includes('fallback') ||
          nameLower === 'region'
        ) {
          countrySyntheticStates.push(state.state_name);
          syntheticStates.push({
            country: country.country_name,
            state: state.state_name
          });
        }
      }
      
      // 2. City contamination check (cross-country, foreign or station label)
      for (const city of countryCities) {
        let isContaminated = false;
        let reasons = [];
        
        // Check station label in city
        const nameLower = city.city_name.toLowerCase();
        const hasStationKeyword = stationKeywords.some(kw => nameLower.includes(kw) || nameLower.includes(' - '));
        if (hasStationKeyword && city.city_name.length > 15) {
          isContaminated = true;
          reasons.push('station_label');
        }
        
        // Check cross-country coordinate bounding boxes
        const lat = parseFloat(city.latitude);
        const lon = parseFloat(city.longitude);
        
        if (lat && lon) {
          const expectedBounds = COUNTRY_BOUNDS[country.country_name];
          if (expectedBounds) {
            const inBounds = lat >= expectedBounds.minLat && lat <= expectedBounds.maxLat &&
                             lon >= expectedBounds.minLon && lon <= expectedBounds.maxLon;
            if (!inBounds) {
              // Check if it belongs to another known country's bounding box
              let actualCountry = 'Unknown';
              for (const [cName, bounds] of Object.entries(COUNTRY_BOUNDS)) {
                if (lat >= bounds.minLat && lat <= bounds.maxLat && lon >= bounds.minLon && lon <= bounds.maxLon) {
                  actualCountry = cName;
                  break;
                }
              }
              isContaminated = true;
              reasons.push(`cross_country_coords (in ${actualCountry} bounds, expected ${country.country_name})`);
            }
          }
        }
        
        if (isContaminated) {
          contaminationCount++;
          countryContaminatedCities.push({
            name: city.city_name,
            reasons
          });
          contaminatedCities.push({
            country: country.country_name,
            state: statesMap.get(city.state_id)?.state_name || 'Unknown',
            city: city.city_name,
            reasons
          });
        }
      }
      
      // Calculate quality score
      // Starts at 100.
      // Deduct 15 points per synthetic/fallback state (up to 45).
      // Deduct 5 points per contaminated city (up to 45).
      // Deduct 10 points if no states but has cities.
      let qualityScore = 100;
      qualityScore -= countrySyntheticStates.length * 15;
      qualityScore -= contaminationCount * 5;
      
      if (countryStates.length === 0 && countryCities.length > 0) {
        qualityScore -= 10;
      } else if (countryStates.length === 1 && countryCities.length > 5 && country.country_name !== 'Singapore') {
        qualityScore -= 5;
      }
      
      qualityScore = Math.max(0, Math.min(100, qualityScore));
      
      auditData.push({
        country: country.country_name,
        statesCount: countryStates.length,
        citiesCount: countryCities.length,
        contaminationCount,
        qualityScore,
        syntheticStates: countrySyntheticStates,
        contaminatedSample: countryContaminatedCities.slice(0, 5)
      });
      
      if (countryStates.length <= 1 && countryCities.length > 5 && country.country_name !== 'Singapore') {
        lowCoverageCountries.push({
          country: country.country_name,
          statesCount: countryStates.length,
          citiesCount: countryCities.length
        });
      }
    }
    
    // Sort by quality score (ascending) to highlight worst offenders first
    auditData.sort((a, b) => a.qualityScore - b.qualityScore);
    
    // Generate HIERARCHY_INTEGRITY_AUDIT.md
    console.log('Writing HIERARCHY_INTEGRITY_AUDIT.md...');
    let report = `# Hierarchy Integrity Audit Report\n\n`;
    report += `Generated on: ${new Date().toISOString()}\n\n`;
    report += `## 1. Executive Summary\n\n`;
    report += `This audit evaluates the integrity of the locations hierarchy stored in the BreatheSmart PostgreSQL database. We analyzed all **${countries.length} countries**, **${states.length} states**, and **${cities.length} cities** to identify synthetic regions, cross-country coordinate contamination, and station labels incorrectly stored as cities.\n\n`;
    report += `These findings form the basis of the Universal Search autocomplete sanitization and cleanup roadmap.\n\n`;
    
    report += `## 2. Synthetic & Fallback Regions by Country\n\n`;
    report += `Synthetic regions (e.g. containing \`unknown_region\`, \`General Region\`, or fallback tags) expose low-quality metadata in the autocomplete drop-downs.\n\n`;
    if (syntheticStates.length > 0) {
      report += `| Country | Synthetic State/Region |\n`;
      report += `| :--- | :--- |\n`;
      syntheticStates.forEach(s => {
        report += `| ${s.country} | \`${s.state}\` |\n`;
      });
    } else {
      report += `No synthetic regions found.\n`;
    }
    report += `\n`;
    
    report += `## 3. Contaminated Cities Audit\n\n`;
    report += `City lists contaminated with foreign coordinates (cross-country bounds mismatch) or raw station labels (e.g. containing CPCB, DPCC, or station codes) create location resolution and ranking errors.\n\n`;
    if (contaminatedCities.length > 0) {
      report += `| Country | State/Region | Contaminated City | Reasons |\n`;
      report += `| :--- | :--- | :--- | :--- |\n`;
      contaminatedCities.slice(0, 50).forEach(c => {
        report += `| ${c.country} | ${c.state} | \`${c.city}\` | ${c.reasons.join(', ')} |\n`;
      });
      if (contaminatedCities.length > 50) {
        report += `\n*Showing first 50 contaminated records. Total contaminated: **${contaminatedCities.length}**.*\n`;
      }
    } else {
      report += `No contaminated cities found.\n`;
    }
    report += `\n`;
    
    report += `## 4. Countries with Low State/Region Coverage\n\n`;
    report += `Countries with many cities but only 0 or 1 state/region records indicate incomplete structural hierarchy coverage.\n\n`;
    if (lowCoverageCountries.length > 0) {
      report += `| Country | States/Regions Count | Cities Count |\n`;
      report += `| :--- | :--- | :--- |\n`;
      lowCoverageCountries.forEach(c => {
        report += `| ${c.country} | ${c.statesCount} | ${c.citiesCount} |\n`;
      });
    } else {
      report += `No countries have low state coverage.\n`;
    }
    report += `\n`;
    
    report += `## 5. Country Quality Metrics & Scoreboard\n\n`;
    report += `The quality score is calculated by starting at 100, deducting 15 points per synthetic state, 5 points per contaminated city, and 5-10 points for low state coverage.\n\n`;
    report += `| Country | State Count | City Count | Contamination Count | Quality Score |\n`;
    report += `| :--- | :--- | :--- | :--- | :--- |\n`;
    auditData.forEach(d => {
      let scoreLabel = '🟢';
      if (d.qualityScore < 50) scoreLabel = '🔴';
      else if (d.qualityScore < 85) scoreLabel = '🟡';
      report += `| ${d.country} | ${d.statesCount} | ${d.citiesCount} | ${d.contaminationCount} | ${scoreLabel} **${d.qualityScore} / 100** |\n`;
    });
    
    fs.writeFileSync(path.join(__dirname, '../HIERARCHY_INTEGRITY_AUDIT.md'), report, 'utf8');
    console.log('Successfully wrote HIERARCHY_INTEGRITY_AUDIT.md!');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
