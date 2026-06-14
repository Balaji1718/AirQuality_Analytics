/**
 * Staging-Only Hierarchy Rebuild from Sanitized Artifact
 * 
 * Truncates staging hierarchy tables and rebuilds from sanitized artifact.
 * PRODUCTION PROTECTED: Requires explicit target confirmation.
 * 
 * Run: node rebuild_staging_hierarchy_from_sanitized.js --apply --target=staging --artifact=path/to/sanitized.json
 */

const fs = require('fs');
const path = require('path');
const { testConnection, pool } = require('./db');
const { populateHierarchy } = require('./hierarchical_schema_design');

function parseArgs(argv) {
  const parsed = { apply: false, target: null, artifact: null };

  for (const arg of argv) {
    if (arg === '--apply') {
      parsed.apply = true;
      continue;
    }

    if (arg.startsWith('--target=')) {
      parsed.target = arg.split('=')[1] || null;
    }

    if (arg.startsWith('--artifact=')) {
      parsed.artifact = arg.split('=')[1] || null;
    }
  }

  return parsed;
}

async function run() {
  console.log('\n▶️ Staging-Only Hierarchy Rebuild from Sanitized Artifact\n');

  const { apply, target, artifact } = parseArgs(process.argv.slice(2));

  if (!apply) {
    console.log('Dry run only. No changes made.');
    console.log('Use --apply --target=staging --artifact=path/to/sanitized.json to execute.');
    process.exit(0);
  }

  if (target !== 'staging') {
    console.error('❌ This script only runs against staging. Use --target=staging.');
    process.exit(1);
  }

  // Require explicit artifact path
  if (!artifact || !fs.existsSync(artifact)) {
    console.error(`❌ Artifact file not found: ${artifact}`);
    console.error('Provide --artifact=/full/path/to/sanitized.json');
    process.exit(1);
  }

  const ok = await testConnection();
  if (!ok) {
    console.error('❌ Database connection failed. Aborting.');
    process.exit(1);
  }

  const coverageData = JSON.parse(fs.readFileSync(artifact, 'utf8'));

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Truncating existing hierarchy tables (staging only)...');
    await client.query('DELETE FROM aqi_hierarchy_cache');
    await client.query('DELETE FROM aqi_cities');
    await client.query('DELETE FROM aqi_states');
    await client.query('DELETE FROM aqi_countries');
    console.log('✅ Tables truncated');

    console.log('Populating hierarchy from sanitized artifact...');
    await populateHierarchy(client, coverageData);
    console.log('✅ Population complete');

    console.log('Regenerating hierarchy cache...');
    const countriesRes = await client.query('SELECT id, country_name, iso2 FROM aqi_countries');
    for (const row of countriesRes.rows) {
      const statesRes = await client.query(
        'SELECT id, state_name, city_count, aqi_sources, center_lat, center_lon FROM aqi_states WHERE country_id = $1',
        [row.id]
      );
      const stateList = [];
      for (const s of statesRes.rows) {
        const citiesRes = await client.query(
          'SELECT id, city_name, latitude, longitude, aqi_sources FROM aqi_cities WHERE state_id = $1 LIMIT 500',
          [s.id]
        );
        stateList.push({
          id: s.id,
          name: s.state_name,
          city_count: s.city_count,
          sources: s.aqi_sources,
          center: { lat: s.center_lat, lon: s.center_lon },
          cities: citiesRes.rows
        });
      }

      const hierarchy = { country: { id: row.id, name: row.country_name, iso2: row.iso2 }, states: stateList };
      await client.query(
        `INSERT INTO aqi_hierarchy_cache (country_id, hierarchy_json, generated_at) 
         VALUES ($1, $2, NOW()) 
         ON CONFLICT (country_id) DO UPDATE SET hierarchy_json = EXCLUDED.hierarchy_json, generated_at = NOW()`,
        [row.id, hierarchy]
      );
    }
    console.log('✅ Cache regenerated');

    await client.query('COMMIT');

    console.log(`\n🎉 Staging hierarchy rebuild complete from sanitized artifact.\n`);
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('⚠️ Rollback failed:', rollbackErr.message);
    }
    console.error('❌ Rebuild failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }

  process.exit(0);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
