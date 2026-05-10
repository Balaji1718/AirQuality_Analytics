const fs = require('fs');
const path = require('path');
const { testConnection, pool } = require('./db');
const { populateHierarchy, validateCoverageMap } = require('./hierarchical_schema_design');

function parseArgs(argv) {
  const parsed = { apply: false, target: null };

  for (const arg of argv) {
    if (arg === '--apply') {
      parsed.apply = true;
      continue;
    }

    if (arg.startsWith('--target=')) {
      parsed.target = arg.split('=')[1] || null;
    }
  }

  return parsed;
}

async function run() {
  console.log('\n▶️ Applying hierarchical migration and populating data...\n');

  const { apply, target } = parseArgs(process.argv.slice(2));
  if (!apply) {
    console.log('Dry run only. No database changes were made.');
    console.log('Use --apply with --target=local|staging|production to execute manually after verification.');
    process.exit(0);
  }

  if (!target || !['local', 'staging', 'production'].includes(target)) {
    console.error('Refusing to run without an explicit safe target. Use --target=local, --target=staging, or --target=production.');
    process.exit(1);
  }

  const ok = await testConnection();
  if (!ok) {
    console.error('Database connection failed. Aborting.');
    process.exit(1);
  }

  // Apply migration SQL
  const migrationPath = path.join(__dirname, 'migration_hierarchical_locations.sql');
  if (!fs.existsSync(migrationPath)) {
    console.error('Migration SQL file not found:', migrationPath);
    process.exit(1);
  }

  const coveragePath = path.join(__dirname, 'aqi_coverage_map.json');
  if (!fs.existsSync(coveragePath)) {
    console.error('Coverage map not found:', coveragePath);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');
  const coverageData = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
  // Validate coverage map and remove invalid country keys before populating
  const invalidKeys = validateCoverageMap(coverageData);
  if (invalidKeys.length > 0) {
    console.warn('⚠️ Coverage map contains invalid country keys that will be skipped:', invalidKeys);
    for (const k of invalidKeys) {
      delete coverageData.supported_countries[k];
    }
  }
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log('Applying migration SQL...');
    await client.query(sql);
    console.log('✅ Migration applied');

    console.log('Populating hierarchy tables from coverage map... (this may take a while)');
    await populateHierarchy(client, coverageData);
    console.log('✅ Hierarchy population complete');

    console.log('Generating hierarchy cache entries...');
    const countriesRes = await client.query('SELECT id, country_name, iso2 FROM aqi_countries');
    for (const row of countriesRes.rows) {
      const statesRes = await client.query('SELECT id, state_name, city_count, aqi_sources, center_lat, center_lon FROM aqi_states WHERE country_id = $1', [row.id]);
      const stateList = [];
      for (const s of statesRes.rows) {
        const citiesRes = await client.query('SELECT id, city_name, latitude, longitude, aqi_sources FROM aqi_cities WHERE state_id = $1 LIMIT 500', [s.id]);
        stateList.push({ id: s.id, name: s.state_name, city_count: s.city_count, sources: s.aqi_sources, center: { lat: s.center_lat, lon: s.center_lon }, cities: citiesRes.rows });
      }

      const hierarchy = { country: { id: row.id, name: row.country_name, iso2: row.iso2 }, states: stateList };
      await client.query(`INSERT INTO aqi_hierarchy_cache (country_id, hierarchy_json, generated_at) VALUES ($1, $2, NOW()) ON CONFLICT (country_id) DO UPDATE SET hierarchy_json = EXCLUDED.hierarchy_json, generated_at = NOW()`, [row.id, hierarchy]);
    }
    console.log('✅ Hierarchy cache generated');

    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('⚠️ Rollback failed:', rollbackErr.message);
    }
    console.error('❌ Migration, population, or cache generation failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }

  console.log(`\n🎉 Done. Migration, population, and cache generation finished for ${target}.\n`);
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
