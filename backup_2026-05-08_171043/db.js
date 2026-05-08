const { Pool } = require('pg');

// Neon PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('❌ Unexpected Neon pool error:', err.message);
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

// Store air quality data with location validation and ON CONFLICT handling
async function storeAirQualityData(data) {
  try {
    const { 
      city, country, latitude, longitude, 
      pollutants = {}, weather = {}, 
      api_source = 'OpenAQ', data_source, 
      timestamp = new Date(), recorded_at,
      aqi, validation 
    } = data;
    
    const currentTime = new Date(recorded_at || timestamp);

    // Use centralized helpers
    const { coerceNumber } = require('./utils/normalize');
    const { validateLocationMatch, findIndianCity, isWithinCityBounds } = require('./utils/locationValidator');
    
    // Validate and normalize location data
    let normalizedCity = city;
    let normalizedCountry = country || 'India';
    let validatedCoords = { lat: coerceNumber(latitude), lon: coerceNumber(longitude) };
    
    // For Indian cities, ensure we use canonical names and coordinates
    const indianCity = findIndianCity(city);
    if (indianCity) {
      normalizedCity = indianCity.canonical;
      normalizedCountry = 'India';
      
      // Use validated coordinates if not provided or if provided coordinates are invalid
      if (!validatedCoords.lat || !validatedCoords.lon) {
        validatedCoords = indianCity.coordinates;
      } else {
        // Validate provided coordinates are reasonable for this city
        if (!isWithinCityBounds(validatedCoords.lat, validatedCoords.lon, indianCity)) {
          console.log(`⚠️  Invalid coordinates for ${city}, using standard coordinates`);
          validatedCoords = indianCity.coordinates;
        }
      }
    }
    
    // Validate pollutant data
    const validatedPollutants = {};
    const pollutantLimits = {
      pm25: { min: 0, max: 1000 },
      pm10: { min: 0, max: 1000 },
      no2: { min: 0, max: 500 },
      so2: { min: 0, max: 500 },
      co: { min: 0, max: 100 },
      o3: { min: 0, max: 500 }
    };
    
    Object.keys(pollutants).forEach(pollutant => {
      const value = coerceNumber(pollutants[pollutant]);
      if (value !== null && pollutantLimits[pollutant]) {
        const { min, max } = pollutantLimits[pollutant];
        if (value >= min && value <= max) {
          validatedPollutants[pollutant] = value;
        } else {
          console.log(`⚠️  Invalid ${pollutant} value: ${value} (expected ${min}-${max}), skipping`);
        }
      } else if (value !== null) {
        validatedPollutants[pollutant] = value; // For unknown pollutants, store as-is
      }
    });
    
    // Validate AQI
    const validatedAqi = aqi && aqi >= 0 && aqi <= 500 ? parseInt(aqi, 10) : null;
    
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
        aqi = CASE WHEN EXCLUDED.aqi IS NOT NULL THEN EXCLUDED.aqi ELSE air_quality_data.aqi END,
        pm25 = CASE WHEN EXCLUDED.pm25 IS NOT NULL THEN EXCLUDED.pm25 ELSE air_quality_data.pm25 END,
        pm10 = CASE WHEN EXCLUDED.pm10 IS NOT NULL THEN EXCLUDED.pm10 ELSE air_quality_data.pm10 END,
        no2 = CASE WHEN EXCLUDED.no2 IS NOT NULL THEN EXCLUDED.no2 ELSE air_quality_data.no2 END,
        so2 = CASE WHEN EXCLUDED.so2 IS NOT NULL THEN EXCLUDED.so2 ELSE air_quality_data.so2 END,
        co = CASE WHEN EXCLUDED.co IS NOT NULL THEN EXCLUDED.co ELSE air_quality_data.co END,
        o3 = CASE WHEN EXCLUDED.o3 IS NOT NULL THEN EXCLUDED.o3 ELSE air_quality_data.o3 END,
        temperature = CASE WHEN EXCLUDED.temperature IS NOT NULL THEN EXCLUDED.temperature ELSE air_quality_data.temperature END,
        humidity = CASE WHEN EXCLUDED.humidity IS NOT NULL THEN EXCLUDED.humidity ELSE air_quality_data.humidity END,
        data_source = EXCLUDED.data_source,
        recorded_at = EXCLUDED.recorded_at
      RETURNING id, city, country, latitude, longitude, recorded_at, recorded_hour
    `;

    const values = [
      normalizedCity, 
      normalizedCountry, 
      validatedCoords.lat, 
      validatedCoords.lon,
      validatedAqi,
      validatedPollutants.pm25 || null, 
      validatedPollutants.pm10 || null, 
      validatedPollutants.no2 || null,
      validatedPollutants.so2 || null, 
      validatedPollutants.co || null, 
      validatedPollutants.o3 || null,
      coerceNumber(weather.temperature), 
      coerceNumber(weather.humidity),
      data_source || api_source, 
      currentTime
    ];

    const result = await client.query(upsertQuery, values);
    
    client.release();
    
    const stored = result.rows[0];
    console.log(`✅ Data stored/updated for ${stored.city}, ${stored.country} at ${stored.recorded_at.toISOString()}`);
    
    return {
      success: true,
      id: stored.id,
      city: stored.city,
      country: stored.country,
      coordinates: { lat: stored.latitude, lon: stored.longitude },
      recorded_at: stored.recorded_at,
      recorded_hour: stored.recorded_hour,
      validation: {
        city_normalized: normalizedCity !== city,
        coordinates_validated: validatedCoords,
        pollutants_validated: Object.keys(validatedPollutants).length,
        aqi_validated: validatedAqi !== null
      },
      message: 'Stored with location validation and conflict resolution'
    };

  } catch (err) {
    console.error('❌ Failed to store validated data:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  pool,
  testConnection,
  initializeTables,
  storeAirQualityData
};
