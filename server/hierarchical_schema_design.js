/**
 * Hierarchical Location Schema Design for AQI Coverage System
 * 
 * This migration adds support for hierarchical location storage:
 * Country → State/Province/Region → City/Local Area
 * 
 * With AQI source tracking and coverage metadata
 */

const fs = require('fs');
const path = require('path');

// ============ BACKEND SCHEMA PROPOSAL ============

const SCHEMA_DESIGN = `
# Hierarchical AQI Location Schema Design

## New Tables

### 1. aqi_countries
Tracks country-level AQI support
\`\`\`
CREATE TABLE aqi_countries (
  id SERIAL PRIMARY KEY,
  country_name VARCHAR(100) UNIQUE NOT NULL,
  iso2 VARCHAR(5),
  iso3 CHAR(3),
  region VARCHAR(50),
  
  -- Coverage tracking
  has_aqi_data BOOLEAN DEFAULT FALSE,
  aqi_sources JSONB DEFAULT '[]', -- ['openaq', 'waqi', 'openweather']
  total_monitored_locations INT DEFAULT 0,
  last_verified TIMESTAMP DEFAULT NOW(),
  verification_count INT DEFAULT 0,
  
  -- Hierarchy info
  state_count INT DEFAULT 0,
  city_count INT DEFAULT 0,
  
  -- Coverage level
  coverage_level VARCHAR(20) -- 'full' | 'partial' | 'minimal' | 'none'
    DEFAULT 'none',
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_country_coverage ON aqi_countries(coverage_level);
CREATE INDEX idx_country_sources ON aqi_countries(aqi_sources);
\`\`\`

### 2. aqi_states (Regions/Provinces)
Tracks state/province/region level coverage
\`\`\`
CREATE TABLE aqi_states (
  id SERIAL PRIMARY KEY,
  country_id INT NOT NULL REFERENCES aqi_countries(id),
  state_name VARCHAR(100) NOT NULL,
  state_code VARCHAR(10),
  region_type VARCHAR(50), -- 'state' | 'province' | 'region' | 'territory'
  
  -- Coverage
  has_aqi_data BOOLEAN DEFAULT FALSE,
  aqi_sources JSONB DEFAULT '[]',
  city_count INT DEFAULT 0,
  
  -- Coordinates for state center
  center_lat DECIMAL(10, 6),
  center_lon DECIMAL(10, 6),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(country_id, state_name)
);

CREATE INDEX idx_state_country ON aqi_states(country_id);
CREATE INDEX idx_state_coverage ON aqi_states(has_aqi_data);
\`\`\`

### 3. aqi_cities
Tracks city/local area AQI data locations
\`\`\`
CREATE TABLE aqi_cities (
  id SERIAL PRIMARY KEY,
  country_id INT NOT NULL REFERENCES aqi_countries(id),
  state_id INT REFERENCES aqi_states(id),
  
  city_name VARCHAR(150) NOT NULL,
  city_code VARCHAR(50),
  
  -- Geographic
  latitude DECIMAL(10, 6) NOT NULL,
  longitude DECIMAL(10, 6) NOT NULL,
  
  -- AQI Support
  has_aqi_data BOOLEAN DEFAULT TRUE,
  aqi_sources JSONB DEFAULT '[]', -- ['openaq', 'waqi', 'openweather']
  
  -- Data freshness
  last_measurement TIMESTAMP,
  measurement_count INT DEFAULT 0,
  
  -- OpenAQ specific
  openaq_location_id VARCHAR(100),
  openaq_location_name VARCHAR(255),
  openaq_measurement_count INT DEFAULT 0,
  
  -- WAQI specific
  waqi_station_id VARCHAR(100),
  waqi_station_name VARCHAR(255),
  
  -- OpenWeather specific
  ow_city_code VARCHAR(100),
  
  -- Metadata
  population INT,
  importance_rank INT, -- 1=capital, 2=major city, 3=medium, 4=small
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(country_id, state_id, city_name)
);

CREATE INDEX idx_city_country ON aqi_cities(country_id);
CREATE INDEX idx_city_state ON aqi_cities(state_id);
CREATE INDEX idx_city_has_data ON aqi_cities(has_aqi_data);
CREATE INDEX idx_city_sources ON aqi_cities(aqi_sources);
CREATE INDEX idx_city_location ON aqi_cities(latitude, longitude);
\`\`\`

### 4. aqi_hierarchy_cache
Pre-computed hierarchy for fast frontend queries
\`\`\`
CREATE TABLE aqi_hierarchy_cache (
  id SERIAL PRIMARY KEY,
  
  -- Full hierarchy
  country_id INT NOT NULL REFERENCES aqi_countries(id),
  hierarchy_json JSONB NOT NULL, -- Pre-built structure below
  
  -- Metadata
  generated_at TIMESTAMP DEFAULT NOW(),
  last_queried TIMESTAMP,
  query_count INT DEFAULT 0,
  
  UNIQUE(country_id)
);

-- Hierarchy JSON structure:
{
  "country": {
    "name": "India",
    "iso2": "IN",
    "coverage": "full",
    "sources": ["openaq", "openweather"]
  },
  "states": [
    {
      "id": 123,
      "name": "Delhi",
      "code": "DL",
      "type": "territory",
      "coverage": "full",
      "cities": [
        {
          "id": 456,
          "name": "New Delhi",
          "lat": 28.7041,
          "lon": 77.1025,
          "sources": ["openaq"],
          "aqi_data": true
        }
      ]
    }
  ]
}
\`\`\`

## API Integration Points

### Frontend Endpoints (New)

1. **GET /api/hierarchy/countries**
   - Returns all countries with AQI data
   - Includes coverage level and sources
   - Cached response

2. **GET /api/hierarchy/countries/:countryId/states**
   - Returns states/regions with AQI data for a country
   - Includes city counts

3. **GET /api/hierarchy/countries/:countryId/states/:stateId/cities**
   - Returns cities with AQI data
   - Includes coordinates and sources

4. **GET /api/hierarchy/search?q=query**
   - Search across countries, states, cities
   - Returns results with hierarchy context

5. **POST /api/hierarchy/validate**
   - Trigger verification run
   - Returns real-time coverage updates

## Data Flow

### Ingestion (Validation Script)
\`\`\`
discover_aqi_coverage.js
  ↓
Query APIs (OpenAQ, WAQI, OpenWeather)
  ↓
Extract: Country → State → City + Sources
  ↓
Populate aqi_countries, aqi_states, aqi_cities
  ↓
Generate aqi_hierarchy_cache for fast queries
  ↓
Export: coverage_map.json for frontend
\`\`\`

### Query (Runtime)
\`\`\`
Frontend: "search for cities in India"
  ↓
API: GET /api/hierarchy/countries/IN/states
  ↓
Query aqi_hierarchy_cache (instant)
  ↓
Return pre-built hierarchy JSON
  ↓
Frontend renders: Select State → Select City
\`\`\`

## Coverage Levels

\`\`\`
FULL: 50+ cities with OpenAQ data
PARTIAL: 5-49 cities OR multi-source coverage
MINIMAL: <5 cities OR single location
NONE: No AQI data
\`\`\`

## Benefits

1. **Hierarchical Search:** Users can drill down Country → State → City
2. **Coverage Hints:** UI shows which levels have data
3. **Multi-Source Support:** Track which APIs provide data
4. **Performance:** Pre-built cache prevents queries
5. **Scalability:** Supports all 193 countries
6. **Frontend-Friendly:** Structured JSON hierarchy ready for autocomplete
`;

// ============ SQL MIGRATION FILE ============

const MIGRATION_SQL = `
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
`;

// ============ LOADER FUNCTION ============

function normalizeSourceList(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (value === null || value === undefined || value === '') {
    return [];
  }

  return [value];
}

function isValidCountryName(name) {
  if (!name) return false;
  const n = String(name).trim();
  if (n.length < 2 || n.length > 100) return false;
  // must contain at least one letter to avoid numeric-only keys
  if (!/[A-Za-z]/.test(n)) return false;
  return true;
}

function sanitizeIso2(v) {
  if (!v) return null;
  const s = String(v).trim().toUpperCase();
  return /^[A-Z]{2,3}$/.test(s) ? s : null;
}

function validateCoverageMap(coverageData) {
  const supported = coverageData?.supported_countries || {};
  const invalid = [];
  for (const k of Object.keys(supported)) {
    if (!isValidCountryName(k)) invalid.push(k);
  }
  return invalid;
}

async function populateHierarchy(db, coverageData) {
  console.log('📊 Populating hierarchical location schema...');
  
  try {
    const supportedCountries = coverageData?.supported_countries || {};

    // Iterate through all supported countries
    for (const [countryNameRaw, countryData] of Object.entries(supportedCountries)) {
      const countryName = String(countryNameRaw || '').trim();
      if (!isValidCountryName(countryName)) {
        console.warn('Skipping invalid country key:', countryNameRaw);
        continue; // Skip invalid entries
      }
      const countrySources = normalizeSourceList(countryData?.aqi_sources);

      // 1. Insert country
      const countryResult = await db.query(
        `INSERT INTO aqi_countries 
         (country_name, iso2, iso3, has_aqi_data, aqi_sources, coverage_level)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (country_name) DO UPDATE SET
           updated_at = NOW(),
           aqi_sources = EXCLUDED.aqi_sources
         RETURNING id`,
        [
          countryName,
          sanitizeIso2(countryData.iso2) || null,
          countryData.iso3 || null,
          true,
          JSON.stringify(countrySources),
          countrySources.length >= 2 ? 'full' : 
          countrySources.length === 1 ? 'partial' : 'minimal'
        ]
      );

      const countryId = countryResult.rows[0].id;

      // 2. Insert states and cities
        for (const [stateNameRaw, stateData] of Object.entries(countryData.regions || {})) {
          const stateName = String(stateNameRaw || '').trim();
          if (!stateName) continue;
          const stateSources = normalizeSourceList(stateData?.sources);
        const stateResult = await db.query(
          `INSERT INTO aqi_states
           (country_id, state_name, has_aqi_data, aqi_sources, city_count)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (country_id, state_name) DO UPDATE SET
             updated_at = NOW(),
             city_count = EXCLUDED.city_count
           RETURNING id`,
          [
            countryId,
            stateName,
            true,
            JSON.stringify(stateSources),
            stateData.cities?.length || 0
          ]
        );

        const stateId = stateResult.rows[0].id;

        // 3. Insert cities
        for (const city of (stateData.cities || [])) {
          if (!city || !city.name) continue;
          const citySources = normalizeSourceList(city?.source);
          await db.query(
            `INSERT INTO aqi_cities
             (country_id, state_id, city_name, latitude, longitude, has_aqi_data, aqi_sources)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (country_id, state_id, city_name) DO UPDATE SET
               updated_at = NOW()`,
            [
              countryId,
              stateId,
              String(city.name).trim(),
              city.coordinates?.latitude || city.coordinates?.lat || null,
              city.coordinates?.longitude || city.coordinates?.lon || null,
              true,
              JSON.stringify(citySources)
            ]
          );
        }
      }

      console.log(`✅ Populated ${countryName}`);
    }

    console.log('✅ Hierarchy population complete');
  } catch (err) {
    console.error('❌ Hierarchy population failed:', err);
    throw err;
  }
}

// ============ EXPORTS ============

module.exports = {
  SCHEMA_DESIGN,
  MIGRATION_SQL,
  populateHierarchy,
  validateCoverageMap
};

// ============ SAVE TO FILE ============

if (require.main === module) {
  fs.writeFileSync(
    path.join(__dirname, 'hierarchical_schema_design.md'),
    SCHEMA_DESIGN
  );
  
  fs.writeFileSync(
    path.join(__dirname, 'migration_hierarchical_locations.sql'),
    MIGRATION_SQL
  );

  console.log('✅ Schema design saved to: hierarchical_schema_design.md');
  console.log('✅ Migration SQL saved to: migration_hierarchical_locations.sql');
}
