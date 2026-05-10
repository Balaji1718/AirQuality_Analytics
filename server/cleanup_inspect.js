const { pool } = require('./db');

(async () => {
  try {
    const tables = ['aqi_countries', 'aqi_states', 'aqi_cities', 'aqi_hierarchy_cache'];
    for (const t of tables) {
      const r = await pool.query('SELECT COUNT(*)::int AS cnt FROM ' + t);
      console.log(t + ': ' + r.rows[0].cnt);
    }
    const badCs = await pool.query("SELECT COUNT(*)::int as cnt FROM aqi_countries WHERE country_name SIMILAR TO '[0-9]+' OR country_name IN ('0','1','2')");
    console.log('malformed_countries:', badCs.rows[0].cnt);
    const sample = await pool.query('SELECT country_name FROM aqi_countries LIMIT 5');
    console.log('sample_countries:', sample.rows.map(r => r.country_name));
    await pool.end();
  } catch (err) {
    console.error('ERROR', err.message);
    process.exitCode = 1;
  }
})();
