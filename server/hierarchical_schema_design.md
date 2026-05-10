
# Hierarchical AQI Location Schema Design

## New Tables

### 1. aqi_countries
Tracks country-level AQI support
```
CREATE TABLE aqi_countries (
  id SERIAL PRIMARY KEY,
  country_name VARCHAR(100) UNIQUE NOT NULL,
  iso2 CHAR(2),
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
```

### 2. aqi_states (Regions/Provinces)
Tracks state/province/region level coverage
```
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
```

### 3. aqi_cities
Tracks city/local area AQI data locations
```
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
```

### 4. aqi_hierarchy_cache
Pre-computed hierarchy for fast frontend queries
```
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
```

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
```
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
```

### Query (Runtime)
```
Frontend: "search for cities in India"
  ↓
API: GET /api/hierarchy/countries/IN/states
  ↓
Query aqi_hierarchy_cache (instant)
  ↓
Return pre-built hierarchy JSON
  ↓
Frontend renders: Select State → Select City
```

## Coverage Levels

```
FULL: 50+ cities with OpenAQ data
PARTIAL: 5-49 cities OR multi-source coverage
MINIMAL: <5 cities OR single location
NONE: No AQI data
```

## Benefits

1. **Hierarchical Search:** Users can drill down Country → State → City
2. **Coverage Hints:** UI shows which levels have data
3. **Multi-Source Support:** Track which APIs provide data
4. **Performance:** Pre-built cache prevents queries
5. **Scalability:** Supports all 193 countries
6. **Frontend-Friendly:** Structured JSON hierarchy ready for autocomplete
