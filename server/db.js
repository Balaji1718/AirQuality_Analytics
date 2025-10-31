const { Pool } = require('pg');

// Neon PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Test database connection
async function testConnection() {
  try {
    console.log('🔄 Testing Neon database connection...');
    console.log('🔗 Database URL:', process.env.DATABASE_URL ? 'Set (hidden for security)' : 'NOT SET');
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time');
    client.release();
    console.log('✅ Neon Database connected at:', result.rows[0].current_time);
    return true;
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    console.error('❌ Connection string detected:', process.env.DATABASE_URL ? 'YES' : 'NO');
    return false;
  }
}

// Initialize air quality table
async function initializeTables() {
  try {
    const client = await pool.connect();
    
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS air_quality_data (
        id SERIAL PRIMARY KEY,
        city VARCHAR(100) NOT NULL,
        country VARCHAR(100),
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        pm25 DECIMAL(10, 3),
        pm10 DECIMAL(10, 3),
        no2 DECIMAL(10, 3),
        so2 DECIMAL(10, 3),
        o3 DECIMAL(10, 3),
        co DECIMAL(10, 3),
        temperature DECIMAL(5, 2),
        humidity DECIMAL(5, 2),
        pressure DECIMAL(7, 2),
        wind_speed DECIMAL(5, 2),
        wind_direction INTEGER,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        hour_recorded INTEGER,
        api_source VARCHAR(50) DEFAULT 'OpenAQ'
      );
      
      CREATE INDEX IF NOT EXISTS idx_city_timestamp ON air_quality_data (city, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_timestamp ON air_quality_data (timestamp DESC);
    `;
    
    await client.query(createTableQuery);
    client.release();
    
    console.log('✅ Database tables initialized');
    return true;
  } catch (err) {
    console.error('❌ Failed to initialize tables:', err.message);
    return false;
  }
}

// Store air quality data
async function storeAirQualityData(data) {
  try {
    const { city, country, latitude, longitude, pollutants = {}, weather = {}, api_source = 'OpenAQ', timestamp = new Date() } = data;
    const currentTime = new Date(timestamp);
    const hour = currentTime.getHours();
    const client = await pool.connect();

    // Check for existing record (prevent duplicates)
    const checkQuery = 'SELECT id FROM air_quality_data WHERE city = $1 AND hour_recorded = $2 AND DATE(timestamp) = DATE($3) LIMIT 1';
    const existingRecord = await client.query(checkQuery, [city, hour, currentTime]);
    
    let result;
    if (existingRecord.rows.length > 0) {
      // Update existing record
      const updateQuery = `
        UPDATE air_quality_data SET
          pm25 = $1, pm10 = $2, no2 = $3, so2 = $4, o3 = $5, co = $6,
          temperature = $7, humidity = $8, pressure = $9, wind_speed = $10, wind_direction = $11,
          api_source = $12, timestamp = $13
        WHERE id = $14 RETURNING id, city, hour_recorded
      `;
      
      const updateValues = [
        pollutants.pm25 || null, pollutants.pm10 || null, pollutants.no2 || null,
        pollutants.so2 || null, pollutants.o3 || null, pollutants.co || null,
        weather.temperature || null, weather.humidity || null, weather.pressure || null,
        weather.wind_speed || null, weather.wind_direction || null, api_source,
        currentTime, existingRecord.rows[0].id
      ];
      
      result = await client.query(updateQuery, updateValues);
      console.log(`🔄 Updated record for ${city} at hour ${hour}`);
    } else {
      // Insert new record
      const insertQuery = `
        INSERT INTO air_quality_data (
          city, country, latitude, longitude, pm25, pm10, no2, so2, o3, co,
          temperature, humidity, pressure, wind_speed, wind_direction,
          timestamp, hour_recorded, api_source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING id, city, hour_recorded
      `;

      const values = [
        city, country || null, latitude || null, longitude || null,
        pollutants.pm25 || null, pollutants.pm10 || null, pollutants.no2 || null,
        pollutants.so2 || null, pollutants.o3 || null, pollutants.co || null,
        weather.temperature || null, weather.humidity || null, weather.pressure || null,
        weather.wind_speed || null, weather.wind_direction || null,
        currentTime, hour, api_source
      ];

      result = await client.query(insertQuery, values);
      console.log(`✅ Inserted new record for ${city} at hour ${hour}`);
    }
    
    client.release();
    
    return {
      success: true,
      id: result.rows[0].id,
      city: result.rows[0].city,
      hour: result.rows[0].hour_recorded,
      message: existingRecord.rows.length > 0 ? 'Updated' : 'Inserted'
    };

  } catch (err) {
    console.error('❌ Failed to store data:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  pool,
  testConnection,
  initializeTables,
  storeAirQualityData
};
