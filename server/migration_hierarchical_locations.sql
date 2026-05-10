
-- Migration: Create hierarchical AQI location schema
-- Version: 001
-- Date: 2026-05-10

BEGIN TRANSACTION;

-- 1. Create aqi_countries table
CREATE TABLE IF NOT EXISTS aqi_countries (
  id SERIAL PRIMARY KEY,
  country_name VARCHAR(100) UNIQUE NOT NULL,
  iso2 VARCHAR(5),
  iso3 CHAR(3),
  region VARCHAR(50),
  has_aqi_data BOOLEAN DEFAULT FALSE,
  aqi_sources JSONB DEFAULT '[]',
  total_monitored_locations INT DEFAULT 0,
  last_verified TIMESTAMP DEFAULT NOW(),
  verification_count INT DEFAULT 0,
  state_count INT DEFAULT 0,
  city_count INT DEFAULT 0,
  coverage_level VARCHAR(20) DEFAULT 'none',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_country_coverage ON aqi_countries(coverage_level);
CREATE INDEX IF NOT EXISTS idx_country_sources ON aqi_countries(aqi_sources);
CREATE INDEX IF NOT EXISTS idx_country_iso2 ON aqi_countries(iso2);

-- 2. Create aqi_states table
CREATE TABLE IF NOT EXISTS aqi_states (
  id SERIAL PRIMARY KEY,
  country_id INT NOT NULL REFERENCES aqi_countries(id) ON DELETE CASCADE,
  state_name VARCHAR(100) NOT NULL,
  state_code VARCHAR(10),
  region_type VARCHAR(50),
  has_aqi_data BOOLEAN DEFAULT FALSE,
  aqi_sources JSONB DEFAULT '[]',
  city_count INT DEFAULT 0,
  center_lat DECIMAL(10, 6),
  center_lon DECIMAL(10, 6),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(country_id, state_name)
);

CREATE INDEX IF NOT EXISTS idx_state_country ON aqi_states(country_id);
CREATE INDEX IF NOT EXISTS idx_state_coverage ON aqi_states(has_aqi_data);

-- 3. Create aqi_cities table
CREATE TABLE IF NOT EXISTS aqi_cities (
  id SERIAL PRIMARY KEY,
  country_id INT NOT NULL REFERENCES aqi_countries(id) ON DELETE CASCADE,
  state_id INT REFERENCES aqi_states(id) ON DELETE CASCADE,
  city_name VARCHAR(150) NOT NULL,
  city_code VARCHAR(50),
  latitude DECIMAL(10, 6) NOT NULL,
  longitude DECIMAL(10, 6) NOT NULL,
  has_aqi_data BOOLEAN DEFAULT TRUE,
  aqi_sources JSONB DEFAULT '[]',
  last_measurement TIMESTAMP,
  measurement_count INT DEFAULT 0,
  openaq_location_id VARCHAR(100),
  openaq_location_name VARCHAR(255),
  openaq_measurement_count INT DEFAULT 0,
  waqi_station_id VARCHAR(100),
  waqi_station_name VARCHAR(255),
  ow_city_code VARCHAR(100),
  population INT,
  importance_rank INT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(country_id, state_id, city_name)
);

CREATE INDEX IF NOT EXISTS idx_city_country ON aqi_cities(country_id);
CREATE INDEX IF NOT EXISTS idx_city_state ON aqi_cities(state_id);
CREATE INDEX IF NOT EXISTS idx_city_has_data ON aqi_cities(has_aqi_data);
CREATE INDEX IF NOT EXISTS idx_city_sources ON aqi_cities(aqi_sources);
CREATE INDEX IF NOT EXISTS idx_city_location ON aqi_cities(latitude, longitude);

-- 4. Create aqi_hierarchy_cache table
CREATE TABLE IF NOT EXISTS aqi_hierarchy_cache (
  id SERIAL PRIMARY KEY,
  country_id INT NOT NULL UNIQUE REFERENCES aqi_countries(id) ON DELETE CASCADE,
  hierarchy_json JSONB NOT NULL,
  generated_at TIMESTAMP DEFAULT NOW(),
  last_queried TIMESTAMP,
  query_count INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cache_country ON aqi_hierarchy_cache(country_id);

-- 5. Create aqi_coverage_summary view
CREATE OR REPLACE VIEW aqi_coverage_summary AS
SELECT 
  ac.id,
  ac.country_name,
  ac.iso2,
  ac.coverage_level,
  ac.aqi_sources,
  COUNT(DISTINCT ast.id) as region_count,
  COUNT(DISTINCT aci.id) as city_count,
  MAX(aci.last_measurement) as latest_data
FROM aqi_countries ac
LEFT JOIN aqi_states ast ON ac.id = ast.country_id AND ast.has_aqi_data = TRUE
LEFT JOIN aqi_cities aci ON ac.id = aci.country_id AND aci.has_aqi_data = TRUE
WHERE ac.has_aqi_data = TRUE
GROUP BY ac.id, ac.country_name, ac.iso2, ac.coverage_level, ac.aqi_sources
ORDER BY ac.country_name;

COMMIT;
