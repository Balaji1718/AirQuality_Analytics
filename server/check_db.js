require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { pool } = require('./db');
(async () => {
  try {
    const count = await pool.query('SELECT COUNT(*) as cnt FROM aqi_states');
    console.log('Total states:', count.rows[0].cnt);
    
    const byCountry = await pool.query(
      'SELECT c.country_name, COUNT(s.id) as state_count FROM aqi_states s JOIN aqi_countries c ON s.country_id=c.id GROUP BY c.country_name ORDER BY state_count DESC LIMIT 15'
    );
    console.log('States by country:', JSON.stringify(byCountry.rows));
    
    const cities = await pool.query('SELECT COUNT(*) as cnt FROM aqi_cities');
    console.log('Total cities:', cities.rows[0].cnt);
    
    const usaId = await pool.query(
      "SELECT id, country_name, iso2 FROM aqi_countries WHERE LOWER(country_name)='united states' LIMIT 1"
    );
    console.log('USA ID:', JSON.stringify(usaId.rows));
    
    const findCountry = await pool.query(
      "SELECT country_name, iso2 FROM aqi_countries WHERE LOWER(country_name) LIKE $1 LIMIT 5",
      ['%states%']
    );
    console.log('States-containing countries:', JSON.stringify(findCountry.rows));
    
    await pool.end();
  } catch(e) {
    console.error('DB error:', e.message);
    process.exit(1);
  }
})();
