const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false,
});

async function migrateDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting database migration...\n');
    
    // Create country_coverage table
    console.log('📋 Creating country_coverage table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS country_coverage (
        id SERIAL PRIMARY KEY,
        country_name VARCHAR(100) NOT NULL UNIQUE,
        iso2 VARCHAR(2),
        iso3 VARCHAR(3),
        region VARCHAR(100),
        has_data BOOLEAN DEFAULT false,
        total_regions_checked INTEGER DEFAULT 0,
        regions_with_data INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_country_name ON country_coverage(country_name);
      CREATE INDEX IF NOT EXISTS idx_iso2 ON country_coverage(iso2);
      CREATE INDEX IF NOT EXISTS idx_has_data ON country_coverage(has_data);
    `);
    console.log('✅ country_coverage table created\n');
    
    // Create region_coverage table
    console.log('📋 Creating region_coverage table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS region_coverage (
        id SERIAL PRIMARY KEY,
        country_name VARCHAR(100) NOT NULL,
        region_name VARCHAR(200) NOT NULL,
        latitude DECIMAL(9,6),
        longitude DECIMAL(9,6),
        has_data BOOLEAN DEFAULT false,
        openweather_available BOOLEAN DEFAULT false,
        waqi_available BOOLEAN DEFAULT false,
        openaq_available BOOLEAN DEFAULT false,
        last_verified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (country_name) REFERENCES country_coverage(country_name),
        UNIQUE(country_name, region_name)
      );
      
      CREATE INDEX IF NOT EXISTS idx_region_country ON region_coverage(country_name);
      CREATE INDEX IF NOT EXISTS idx_region_has_data ON region_coverage(has_data);
      CREATE INDEX IF NOT EXISTS idx_api_available ON region_coverage(openweather_available, waqi_available, openaq_available);
    `);
    console.log('✅ region_coverage table created\n');
    
    // Create city_data table for storing recent measurements
    console.log('📋 Creating city_data table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS city_data (
        id SERIAL PRIMARY KEY,
        country_name VARCHAR(100) NOT NULL,
        city_name VARCHAR(200) NOT NULL,
        latitude DECIMAL(9,6),
        longitude DECIMAL(9,6),
        aqi INTEGER,
        pm25 DECIMAL(10,2),
        pm10 DECIMAL(10,2),
        no2 DECIMAL(10,2),
        so2 DECIMAL(10,2),
        o3 DECIMAL(10,2),
        co DECIMAL(10,2),
        data_source VARCHAR(50),
        measured_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (country_name) REFERENCES country_coverage(country_name)
      );
      
      CREATE INDEX IF NOT EXISTS idx_city_country ON city_data(country_name);
      CREATE INDEX IF NOT EXISTS idx_city_name ON city_data(city_name);
      CREATE INDEX IF NOT EXISTS idx_measured_at ON city_data(measured_at DESC);
      CREATE INDEX IF NOT EXISTS idx_aqi ON city_data(aqi);
    `);
    console.log('✅ city_data table created\n');
    
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║           DATABASE MIGRATION COMPLETED                 ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('\n✅ New tables created:');
    console.log('  - country_coverage: Track country-level coverage');
    console.log('  - region_coverage: Track region/city-level data availability');
    console.log('  - city_data: Store recent air quality measurements');
    
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrateDatabase().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
