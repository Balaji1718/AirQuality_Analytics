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
    
    // First check if the table exists and what columns it has
    const checkTableQuery = `
      SELECT column_name, data_type, is_generated
      FROM information_schema.columns 
      WHERE table_name = 'air_quality_data' AND table_schema = 'public'
    `;
    
    let tableInfo;
    try {
      tableInfo = await client.query(checkTableQuery);
    } catch (err) {
      tableInfo = { rows: [] };
    }
    
    const existingColumns = tableInfo.rows.map(row => row.column_name);
    const hasGeneratedRecordedHour = tableInfo.rows.some(row => 
      row.column_name === 'recorded_hour' && row.is_generated === 'ALWAYS'
    );
    
    if (tableInfo.rows.length === 0) {
      // Create new table with proper structure
      console.log('🆕 Creating new air_quality_data table...');
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
          recorded_hour TIMESTAMP GENERATED ALWAYS AS (DATE_TRUNC('hour', recorded_at)) STORED
        );
        
        -- Create unique constraint on city and recorded_hour
        CREATE UNIQUE INDEX IF NOT EXISTS idx_city_recorded_hour 
        ON air_quality_data (city, recorded_hour);
        
        CREATE INDEX IF NOT EXISTS idx_city_recorded_at ON air_quality_data (city, recorded_at DESC);
        CREATE INDEX IF NOT EXISTS idx_recorded_at ON air_quality_data (recorded_at DESC);
      `;
      
      await client.query(createTableQuery);
      console.log('✅ New table created with generated recorded_hour column');
      
    } else if (hasGeneratedRecordedHour) {
      // Table exists with generated column - this is correct, just ensure indexes
      console.log('✅ Table exists with generated recorded_hour column');
      
      const indexQueries = `
        CREATE UNIQUE INDEX IF NOT EXISTS idx_city_recorded_hour 
        ON air_quality_data (city, recorded_hour);
        
        CREATE INDEX IF NOT EXISTS idx_city_recorded_at ON air_quality_data (city, recorded_at DESC);
        CREATE INDEX IF NOT EXISTS idx_recorded_at ON air_quality_data (recorded_at DESC);
      `;
      
      await client.query(indexQueries);
      
    } else {
      // Table exists but needs migration to generated column
      console.log('🔄 Migrating existing table to use generated recorded_hour...');
      
      if (existingColumns.includes('recorded_hour')) {
        // Drop the old recorded_hour column
        await client.query('ALTER TABLE air_quality_data DROP COLUMN IF EXISTS recorded_hour CASCADE');
        console.log('🗑️  Dropped old recorded_hour column');
      }
      
      // Add the new generated column
      await client.query(`
        ALTER TABLE air_quality_data 
        ADD COLUMN recorded_hour TIMESTAMP GENERATED ALWAYS AS (DATE_TRUNC('hour', recorded_at)) STORED
      `);
      console.log('✅ Added generated recorded_hour column');
      
      // Create indexes
      const indexQueries = `
        CREATE UNIQUE INDEX IF NOT EXISTS idx_city_recorded_hour 
        ON air_quality_data (city, recorded_hour);
        
        CREATE INDEX IF NOT EXISTS idx_city_recorded_at ON air_quality_data (city, recorded_at DESC);
        CREATE INDEX IF NOT EXISTS idx_recorded_at ON air_quality_data (recorded_at DESC);
      `;
      
      await client.query(indexQueries);
      console.log('✅ Created indexes for generated column');
    }
    
    client.release();
    console.log('✅ Database tables initialized successfully');
    return true;
    
  } catch (err) {
    console.error('❌ Failed to initialize tables:', err.message);
    return false;
  }
}

// Store air quality data with ON CONFLICT handling
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
    
    // Use ON CONFLICT to handle duplicates automatically
    // Note: recorded_hour is a generated column, so PostgreSQL calculates it automatically
    const upsertQuery = `
      INSERT INTO air_quality_data (
        city, country, latitude, longitude, aqi, pm25, pm10, no2, so2, co, o3,
        temperature, humidity, data_source, recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (city, recorded_hour)
      DO UPDATE SET
        aqi = EXCLUDED.aqi,
        pm25 = EXCLUDED.pm25,
        pm10 = EXCLUDED.pm10,
        no2 = EXCLUDED.no2,
        so2 = EXCLUDED.so2,
        co = EXCLUDED.co,
        o3 = EXCLUDED.o3,
        temperature = EXCLUDED.temperature,
        humidity = EXCLUDED.humidity,
        data_source = EXCLUDED.data_source,
        recorded_at = EXCLUDED.recorded_at
      RETURNING id, city, recorded_at, recorded_hour
    `;

    const values = [
      city, country || null, coerceNumber(latitude), coerceNumber(longitude),
      aqi ? parseInt(aqi, 10) : null,
      coerceNumber(pollutants.pm25), coerceNumber(pollutants.pm10), coerceNumber(pollutants.no2),
      coerceNumber(pollutants.so2), coerceNumber(pollutants.co), coerceNumber(pollutants.o3),
      coerceNumber(weather.temperature), coerceNumber(weather.humidity),
      data_source || api_source, currentTime
    ];

    const result = await client.query(upsertQuery, values);
    
    client.release();
    
    console.log(`✅ Data stored/updated for ${city} at ${currentTime.toISOString()}`);
    
    return {
      success: true,
      id: result.rows[0].id,
      city: result.rows[0].city,
      recorded_at: result.rows[0].recorded_at,
      recorded_hour: result.rows[0].recorded_hour,
      message: 'Stored with conflict resolution'
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
