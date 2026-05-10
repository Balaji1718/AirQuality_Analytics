const db = require('./db');

async function main(){
  try{
    await db.pool.query('SELECT 1');
    console.log('DB connection: OK');

    const tablesRes = await db.pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'aqi_%' ORDER BY tablename;");
    if(tablesRes.rows.length===0){
      console.log('No aqi_ tables found');
    } else {
      console.log('aqi_ tables:\n' + tablesRes.rows.map(r=>r.tablename).join('\n'));
    }

    // For known tables, show counts if they exist
    const known = ['aqi_countries','aqi_states','aqi_cities','aqi_hierarchy_cache'];
    for(const t of known){
      try{
        const r = await db.pool.query(`SELECT COUNT(*) as c FROM ${t}`);
        console.log(`${t}: ${r.rows[0].c}`);
      } catch(e){
        console.log(`${t}: (not present)`);
      }
    }

    // Check for malformed country names
    try{
      const m = await db.pool.query("SELECT COUNT(*) as c FROM aqi_countries WHERE country_name ~ '^\\\\d+$' OR country_name IN ('0','1','2')");
      console.log('malformed_countries:', m.rows[0].c);
    } catch(e){
      console.log('malformed_countries: (table absent)');
    }

    await db.pool.end();
  }catch(err){
    console.error('Preflight ERROR:', err.message);
    try{ await db.pool.end(); }catch(e){}
    process.exit(2);
  }
}

main();
