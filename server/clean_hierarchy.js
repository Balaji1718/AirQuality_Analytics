const dotenv = require('dotenv');
const path = require('path');

// Load environment variables first
dotenv.config({ path: path.join(__dirname, '.env') });

const { pool } = require('./db');

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

async function clean() {
  console.log('🔄 Connecting to Neon Database to start hierarchy cleanup...');
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Rename 'unknown_region' to 'General Region' in aqi_states
    console.log('🧹 Renaming synthetic "unknown_region" state records...');
    const renameStatesRes = await client.query(`
      UPDATE aqi_states
      SET state_name = 'General Region'
      WHERE state_name = 'unknown_region'
      RETURNING id, state_name
    `);
    console.log(`✅ Renamed ${renameStatesRes.rowCount} synthetic states.`);

    // 2. Delete contaminated cities (station labels in city_name)
    console.log('🧹 Purging station labels stored incorrectly as cities...');
    let deletedStationsCount = 0;
    for (const kw of stationKeywords) {
      const deleteRes = await client.query(
        `DELETE FROM aqi_cities WHERE city_name ILIKE $1`,
        [`%${kw}%`]
      );
      deletedStationsCount += deleteRes.rowCount;
    }
    
    // Also delete any with " - " or containing monitor tags
    const deleteDashRes = await client.query(
      `DELETE FROM aqi_cities WHERE city_name LIKE '% - %' OR city_name ILIKE '%monitor%'`
    );
    deletedStationsCount += deleteDashRes.rowCount;
    console.log(`✅ Deleted ${deletedStationsCount} station-contaminated cities.`);

    // 3. Fetch countries and clean cross-country coordinate contamination
    console.log('🧹 Purging cross-country coordinate contaminated cities...');
    const countriesRes = await client.query('SELECT * FROM aqi_countries');
    const countries = countriesRes.rows;
    
    let deletedCrossCountryCount = 0;
    for (const country of countries) {
      const bounds = COUNTRY_BOUNDS[country.country_name];
      if (bounds) {
        // Delete cities whose coordinates fall outside their assigned country
        const deleteRes = await client.query(`
          DELETE FROM aqi_cities
          WHERE country_id = $1
            AND (latitude < $2 OR latitude > $3 OR longitude < $4 OR longitude > $5)
        `, [country.id, bounds.minLat, bounds.maxLat, bounds.minLon, bounds.maxLon]);
        deletedCrossCountryCount += deleteRes.rowCount;
      }
    }
    console.log(`✅ Deleted ${deletedCrossCountryCount} cross-country coordinate contaminated cities.`);

    // 4. Clean up duplicates in aqi_cities
    console.log('🧹 Eliminating duplicate city hierarchy branches...');
    const duplicateRes = await client.query(`
      DELETE FROM aqi_cities c1
      USING aqi_cities c2
      WHERE c1.id > c2.id
        AND c1.country_id = c2.country_id
        AND COALESCE(c1.state_id, 0) = COALESCE(c2.state_id, 0)
        AND LOWER(c1.city_name) = LOWER(c2.city_name)
    `);
    console.log(`✅ Eliminated ${duplicateRes.rowCount} duplicate city entries.`);

    // 5. Update state_count and city_count in aqi_countries
    console.log('🔄 Updating state and city counts on aqi_countries...');
    await client.query(`
      UPDATE aqi_countries ac
      SET state_count = (SELECT COUNT(*)::int FROM aqi_states WHERE country_id = ac.id),
          city_count = (SELECT COUNT(*)::int FROM aqi_cities WHERE country_id = ac.id)
    `);
    
    // Update city_count in aqi_states
    await client.query(`
      UPDATE aqi_states ast
      SET city_count = (SELECT COUNT(*)::int FROM aqi_cities WHERE state_id = ast.id)
    `);

    // 6. Regenerate aqi_hierarchy_cache
    console.log('🔄 Regenerating clean hierarchy cache table...');
    await client.query('DELETE FROM aqi_hierarchy_cache');
    console.log('✅ Invalidated hierarchy cache.');

    await client.query('COMMIT');
    console.log('🎉 Database Sanitization Successfully Committed!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.log('❌ Cleanup failed, rolled back changes:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  clean()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('FATAL ERROR:', err);
      process.exit(1);
    });
} else {
  module.exports = { clean };
}
