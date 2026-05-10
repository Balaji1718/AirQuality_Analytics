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

    console.log('Connected to staging DB (inspecting)...');

    const tablesRes = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'aqi_%';");
    const tables = tablesRes.rows.map(r => r.table_name);
    console.log('Found tables:', tables);

    for (const t of tables) {
      const cnt = await client.query(`SELECT count(*) FROM ${t};`);
      console.log(`${t}: ${cnt.rows[0].count} rows`);
      const sample = await client.query(`SELECT * FROM ${t} LIMIT 5;`);
      console.log(`Sample rows from ${t}:`, sample.rows);
    }

    await client.release();
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Inspect error:', err.message);
    process.exit(1);
  }
})();