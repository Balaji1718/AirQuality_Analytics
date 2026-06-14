/**
 * seed_missing_states.js
 * Seeds major Indian states, US states, and other key regions
 * into the aqi_states table for proper region-level search intent classification.
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { pool } = require('./db');

const STATES_TO_SEED = [
  // India
  { country: 'India', states: [
    'Tamil Nadu', 'Karnataka', 'Maharashtra', 'Delhi', 'West Bengal',
    'Telangana', 'Rajasthan', 'Uttar Pradesh', 'Haryana', 'Gujarat',
    'Bihar', 'Andhra Pradesh', 'Kerala', 'Odisha', 'Madhya Pradesh',
    'Uttarakhand', 'Himachal Pradesh', 'Goa', 'Punjab', 'Jharkhand',
    'Assam', 'Chhattisgarh', 'Jammu and Kashmir'
  ]},
  // USA
  { country: 'United States', states: [
    'California', 'Texas', 'New York', 'Florida', 'Illinois',
    'Pennsylvania', 'Ohio', 'Georgia', 'North Carolina', 'Michigan',
    'New Jersey', 'Virginia', 'Washington', 'Arizona', 'Massachusetts',
    'Tennessee', 'Indiana', 'Maryland', 'Missouri', 'Colorado',
    'Wisconsin', 'Nevada', 'Oregon', 'Oklahoma', 'Louisiana',
    'Kentucky', 'Alabama', 'Minnesota', 'South Carolina', 'Utah'
  ]},
  // UK
  { country: 'United Kingdom', states: [
    'England', 'Scotland', 'Wales', 'Northern Ireland', 'London'
  ]},
  // China
  { country: 'China', states: [
    'Beijing', 'Shanghai', 'Guangdong', 'Shandong', 'Henan',
    'Sichuan', 'Hubei', 'Hunan', 'Zhejiang', 'Jiangsu', 'Tianjin'
  ]},
  // Germany
  { country: 'Germany', states: [
    'Bavaria', 'Berlin', 'Brandenburg', 'Hamburg', 'Hesse',
    'Lower Saxony', 'North Rhine-Westphalia', 'Saxony'
  ]},
  // Australia
  { country: 'Australia', states: [
    'New South Wales', 'Victoria', 'Queensland', 'Western Australia',
    'South Australia', 'Tasmania', 'Australian Capital Territory'
  ]},
  // Canada
  { country: 'Canada', states: [
    'Ontario', 'Quebec', 'British Columbia', 'Alberta', 'Manitoba',
    'Saskatchewan', 'Nova Scotia', 'New Brunswick'
  ]},
  // France
  { country: 'France', states: [
    'Ile-de-France', 'Auvergne-Rhone-Alpes', 'Provence-Alpes-Cote-d-Azur',
    'Occitanie', 'Nouvelle-Aquitaine', 'Hauts-de-France', 'Grand-Est'
  ]},
];

async function seedStates() {
  console.log('🌱 Starting state seeding...\n');
  let totalInserted = 0;
  let totalSkipped = 0;

  for (const { country, states } of STATES_TO_SEED) {
    // Find country ID
    const countryRow = await pool.query(
      'SELECT id, country_name FROM aqi_countries WHERE LOWER(country_name) = LOWER($1) LIMIT 1',
      [country]
    );
    if (countryRow.rowCount === 0) {
      console.log(`  ⚠️  Country "${country}" not found in DB, skipping...`);
      continue;
    }
    const countryId = countryRow.rows[0].id;
    const countryName = countryRow.rows[0].country_name;
    console.log(`📍 Processing ${states.length} states for ${countryName} (id=${countryId})`);

    for (const stateName of states) {
      // Check if already exists
      const existing = await pool.query(
        'SELECT id FROM aqi_states WHERE LOWER(state_name) = LOWER($1) AND country_id = $2 LIMIT 1',
        [stateName, countryId]
      );
      if (existing.rowCount > 0) {
        console.log(`  ⏭️  ${stateName} already exists, skipping`);
        totalSkipped++;
        continue;
      }

      // Insert
      await pool.query(
        `INSERT INTO aqi_states (state_name, country_id, city_count)
         VALUES ($1, $2, 0)
         ON CONFLICT DO NOTHING`,
        [stateName, countryId]
      );
      console.log(`  ✅ Inserted: ${stateName}`);
      totalInserted++;
    }
  }

  // Fix USA iso2
  const usaUpdate = await pool.query(
    "UPDATE aqi_countries SET iso2 = 'US', iso3 = 'USA' WHERE LOWER(country_name) = 'united states' AND (iso2 IS NULL OR iso2 = '')"
  );
  if (usaUpdate.rowCount > 0) {
    console.log('\n✅ Fixed USA iso2/iso3 codes');
  }

  console.log(`\n✅ Seeding complete: ${totalInserted} inserted, ${totalSkipped} skipped`);
  
  // Verify
  const verifyCount = await pool.query('SELECT COUNT(*) as cnt FROM aqi_states');
  console.log(`📊 Total states in DB now: ${verifyCount.rows[0].cnt}`);

  const verifyByCountry = await pool.query(
    'SELECT c.country_name, COUNT(s.id) as cnt FROM aqi_states s JOIN aqi_countries c ON s.country_id=c.id GROUP BY c.country_name ORDER BY cnt DESC LIMIT 10'
  );
  console.log('Top countries by state count:', JSON.stringify(verifyByCountry.rows, null, 2));

  await pool.end();
}

seedStates().catch(e => {
  console.error('❌ Seeding failed:', e.message);
  pool.end();
  process.exit(1);
});
