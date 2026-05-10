const { pool, testConnection } = require('./db');

function parseArgs(argv) {
  const parsed = { apply: false, target: null };
  for (const arg of argv) {
    if (arg === '--apply') parsed.apply = true;
    if (arg.startsWith('--target=')) parsed.target = arg.split('=')[1] || null;
  }
  return parsed;
}

async function run() {
  const { apply, target } = parseArgs(process.argv.slice(2));
  if (!apply) {
    console.log('Dry run only. No database changes were made. Use --apply --target=staging to execute.');
    process.exit(0);
  }
  if (target !== 'staging') {
    console.error('This cleanup script only runs against staging. Use --target=staging.');
    process.exit(1);
  }

  const ok = await testConnection();
  if (!ok) {
    console.error('Database connection failed. Aborting.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find malformed countries: numeric-only names
    const malformedRes = await client.query("SELECT id, country_name FROM aqi_countries WHERE country_name ~ '^\\\d+$' OR country_name IN ('0','1','2')");
    if (malformedRes.rows.length === 0) {
      console.log('No malformed country entries found.');
      await client.query('COMMIT');
      process.exit(0);
    }

    console.log('Found malformed countries:', malformedRes.rows.map(r => r.country_name));

    const ids = malformedRes.rows.map(r => r.id);

    // Log counts before deletion
    const countsBefore = {};
    for (const id of ids) {
      const c = await client.query('SELECT COUNT(*)::int AS cities FROM aqi_cities WHERE country_id = $1', [id]);
      const s = await client.query('SELECT COUNT(*)::int AS states FROM aqi_states WHERE country_id = $1', [id]);
      countsBefore[id] = { cities: c.rows[0].cities, states: s.rows[0].states };
    }
    console.log('Counts before deletion by country id:', countsBefore);

    // Delete cache entries first
    await client.query('DELETE FROM aqi_hierarchy_cache WHERE country_id = ANY($1::int[])', [ids]);
    // Delete cities and states (cascade would remove cities when deleting countries, but be explicit)
    await client.query('DELETE FROM aqi_cities WHERE country_id = ANY($1::int[])', [ids]);
    await client.query('DELETE FROM aqi_states WHERE country_id = ANY($1::int[])', [ids]);
    const delRes = await client.query('DELETE FROM aqi_countries WHERE id = ANY($1::int[]) RETURNING id, country_name', [ids]);

    console.log('Deleted countries:', delRes.rows.map(r => r.country_name));

    await client.query('COMMIT');
    console.log('Cleanup complete.');
  } catch (err) {
    console.error('Cleanup failed, rolling back:', err.message || err);
    try { await client.query('ROLLBACK'); } catch (e) { console.error('Rollback failed:', e.message); }
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
