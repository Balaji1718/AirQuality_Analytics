const { Pool } = require('pg');
(async () => {
  try {
    const conn = process.env.DATABASE_URL;
    if (!conn) {
      console.error('No DATABASE_URL provided');
      process.exit(2);
    }
    const pool = new Pool({ connectionString: conn, ssl: conn.includes('neon.tech') ? { rejectUnauthorized: false } : false });
    const client = await pool.connect();
    console.log('Connected to staging DB (rollback)...');

    const stmts = [
      'DROP VIEW IF EXISTS aqi_coverage_summary CASCADE;',
      'DROP TABLE IF EXISTS aqi_hierarchy_cache CASCADE;',
      'DROP TABLE IF EXISTS aqi_cities CASCADE;',
      'DROP TABLE IF EXISTS aqi_states CASCADE;',
      'DROP TABLE IF EXISTS aqi_coverage_summary CASCADE;',
      'DROP TABLE IF EXISTS aqi_countries CASCADE;'
    ];

    for (const s of stmts) {
      try {
        await client.query(s);
        console.log('Executed:', s.trim());
      } catch (err) {
        console.error('Error executing:', s.trim(), err.message);
      }
    }

    await client.release();
    await pool.end();
    console.log('Rollback complete');
    process.exit(0);
  } catch (err) {
    console.error('Rollback error:', err.message);
    process.exit(1);
  }
})();