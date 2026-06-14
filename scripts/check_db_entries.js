const { pool } = require('../server/db');
(async () => {
  try {
    // Check how USA is stored
    const usa = await pool.query("SELECT country_name, iso2 FROM aqi_countries WHERE LOWER(country_name) LIKE '%unit%state%' OR iso2='US' LIMIT 5");
    console.log('USA entries:', JSON.stringify(usa.rows));
    
    // Check Tamil Nadu
    const tn = await pool.query("SELECT s.state_name, c.country_name FROM aqi_states s JOIN aqi_countries c ON s.country_id=c.id WHERE LOWER(s.state_name) LIKE '%tamil%' LIMIT 5");
    console.log('Tamil Nadu entries:', JSON.stringify(tn.rows));
    
    // Check California, Texas
    const states = await pool.query("SELECT s.state_name, c.country_name FROM aqi_states s JOIN aqi_countries c ON s.country_id=c.id WHERE LOWER(s.state_name) IN ('california','texas','new york') LIMIT 10");
    console.log('US States:', JSON.stringify(states.rows));
    
    // Check India country entry
    const india = await pool.query("SELECT country_name, iso2 FROM aqi_countries WHERE LOWER(country_name) = 'india' LIMIT 1");
    console.log('India entry:', JSON.stringify(india.rows));
    
    await pool.end();
  } catch(e) { console.error(e.message); process.exit(1); }
})();
