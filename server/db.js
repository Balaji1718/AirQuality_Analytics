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

// Initialize air quality table - Updated to match your new table structure
async function initializeTables() {
  try {
    const client = await pool.connect();
    
    // Create table with updated structure including recorded_hour
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS air_quality_data (
        id SERIAL PRIMARY KEY,
        city VARCHAR(100),
        country VARCHAR(100),
        latitude DECIMAL(9,6),
        longitude DECIMAL(9,6),
        aqi INTEGER,
        pm25 DECIMAL(10,2),
        pm10 DECIMAL(10,2),
        no2 DECIMAL(10,2),
        so2 DECIMAL(10,2),
        co DECIMAL(10,2),
        o3 DECIMAL(10,2),
        temperature DECIMAL(5,2),
        humidity DECIMAL(5,2),
        data_source VARCHAR(50),
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        recorded_hour TIMESTAMP
      );
      
      -- Add recorded_hour column if it doesn't exist (for existing databases)
      ALTER TABLE air_quality_data 
      ADD COLUMN IF NOT EXISTS recorded_hour TIMESTAMP;
      
      -- Update existing records to set recorded_hour (truncated to hour)
      UPDATE air_quality_data 
      SET recorded_hour = DATE_TRUNC('hour', recorded_at) 
      WHERE recorded_hour IS NULL;
      
      -- Create unique constraint on city and recorded_hour
      CREATE UNIQUE INDEX IF NOT EXISTS idx_city_recorded_hour 
      ON air_quality_data (city, recorded_hour);
      
      CREATE INDEX IF NOT EXISTS idx_city_recorded_at ON air_quality_data (city, recorded_at DESC);
      CREATE INDEX IF NOT EXISTS idx_recorded_at ON air_quality_data (recorded_at DESC);
    `;
    
    await client.query(createTableQuery);
    client.release();
    
    console.log('✅ Database tables initialized with new structure');
    return true;
  } catch (err) {
    console.error('❌ Failed to initialize tables:', err.message);
    return false;
  }
}

// Store air quality data
async function storeAirQualityData(data) {
  try {
    const { 
      city, country, latitude, longitude, 
      pollutants = {}, weather = {}, 
      api_source = 'OpenAQ', data_source, 
      timestamp = new Date(), recorded_at,
      aqi 
    } = data;
    
    const currentTime = new Date(recorded_at || timestamp);

    // Use centralized helper
    const { coerceNumber } = require('./utils/normalize');
    const client = await pool.connect();

    // Calculate recorded_hour (truncated to hour)
    const recordedHour = new Date(currentTime);
    recordedHour.setMinutes(0, 0, 0); // Set to exact hour
    
    // Check for existing record (prevent duplicates within same hour)
    const checkQuery = `
      SELECT id FROM air_quality_data 
      WHERE city = $1 AND recorded_hour = $2 
      LIMIT 1
    `;
    const existingRecord = await client.query(checkQuery, [city, recordedHour]);
    
    let result;
    if (existingRecord.rows.length > 0) {
      // Update existing record
      const updateQuery = `
        UPDATE air_quality_data SET
          aqi = $1, pm25 = $2, pm10 = $3, no2 = $4, so2 = $5, co = $6, o3 = $7,
          temperature = $8, humidity = $9, data_source = $10, recorded_at = $11, recorded_hour = $12
        WHERE id = $13 RETURNING id, city, recorded_at
      `;
      
      const updateValues = [
        aqi ? parseInt(aqi, 10) : null,
        coerceNumber(pollutants.pm25), coerceNumber(pollutants.pm10), coerceNumber(pollutants.no2),
        coerceNumber(pollutants.so2), coerceNumber(pollutants.co), coerceNumber(pollutants.o3),
        coerceNumber(weather.temperature), coerceNumber(weather.humidity),
        data_source || api_source, currentTime, recordedHour, existingRecord.rows[0].id
      ];
      
      result = await client.query(updateQuery, updateValues);
      console.log(`🔄 Updated record for ${city} at ${currentTime.toISOString()}`);
    } else {
      // Insert new record
      const insertQuery = `
        INSERT INTO air_quality_data (
          city, country, latitude, longitude, aqi, pm25, pm10, no2, so2, co, o3,
          temperature, humidity, data_source, recorded_at, recorded_hour
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING id, city, recorded_at
      `;

      const values = [
        city, country || null, coerceNumber(latitude), coerceNumber(longitude),
        aqi ? parseInt(aqi, 10) : null,
        coerceNumber(pollutants.pm25), coerceNumber(pollutants.pm10), coerceNumber(pollutants.no2),
        coerceNumber(pollutants.so2), coerceNumber(pollutants.co), coerceNumber(pollutants.o3),
        coerceNumber(weather.temperature), coerceNumber(weather.humidity),
        data_source || api_source, currentTime, recordedHour
      ];

      result = await client.query(insertQuery, values);
      console.log(`✅ Inserted new record for ${city} at ${currentTime.toISOString()}`);
    }
    
    client.release();
    
    return {
      success: true,
      id: result.rows[0].id,
      city: result.rows[0].city,
      recorded_at: result.rows[0].recorded_at,
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
