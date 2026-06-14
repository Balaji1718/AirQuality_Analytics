/**
 * Hierarchy API Router
 * 
 * Isolated hierarchy endpoints for regional AQI coverage:
 * - GET /api/hierarchy/countries - All countries with AQI data
 * - GET /api/hierarchy/countries/:countryId/states - States for a country
 * - GET /api/hierarchy/countries/:countryId/states/:stateId/cities - Cities for a state (paginated)
 * - GET /api/hierarchy/search - Search across hierarchy
 * - POST /api/hierarchy/validate - Trigger verification (optional)
 * 
 * Requirements:
 * ✅ Preserve production behavior (isolated routing)
 * ✅ Backward-compatible responses (consistent JSON shapes)
 * ✅ Graceful error handling (no 500s for unsupported regions)
 * ✅ Validation & pagination (bounds checking, limit enforcement)
 * ✅ Caching with node-cache (5-min TTL for countries/states)
 * ✅ Feature-safe routing (completely isolated from existing endpoints)
 */

const express = require('express');
const NodeCache = require('node-cache');
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

const router = express.Router();

// Initialize cache for hierarchy data (5-minute TTL)
const hierarchyCache = new NodeCache({ stdTTL: 300 });

const REQUIRED_HIERARCHY_TABLES = [
  'aqi_countries',
  'aqi_states',
  'aqi_cities',
  'aqi_hierarchy_cache',
];

const hierarchySourceStateCacheKey = 'hierarchy_source_state';

// Load coverage data once at startup
let coverageData = {};
let countriesList = [];

function loadCoverageData() {
  try {
    const coveragePath = path.join(__dirname, 'aqi_coverage_map.json');
    if (fs.existsSync(coveragePath)) {
      const data = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
      coverageData = data.supported_countries || {};
      
      // Build countries list from coverage data
      countriesList = Object.keys(coverageData)
        .filter(key => {
          // Skip numeric keys (malformed entries) and empty countries
          if (!isNaN(key)) return false;
          const country = coverageData[key];
          return country && typeof country === 'object';
        })
        .map(countryName => ({
          id: countryName,
          name: countryName,
          iso2: coverageData[countryName].iso2 || null,
          regions: Object.keys(coverageData[countryName].regions || {}).length,
          sources: coverageData[countryName].aqi_sources || [],
          hasData: (coverageData[countryName].regions && Object.keys(coverageData[countryName].regions).length > 0) ||
                   (coverageData[countryName].total_locations && coverageData[countryName].total_locations > 0)
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      console.log(`✅ Hierarchy: Loaded ${countriesList.length} countries with coverage data`);
      return true;
    } else {
      console.warn('⚠️ Hierarchy: aqi_coverage_map.json not found, hierarchy endpoints will return empty results');
      return false;
    }
  } catch (err) {
    console.error('❌ Hierarchy: Failed to load coverage data:', err.message);
    return false;
  }
}

// Load coverage data on module initialization
loadCoverageData();

function normalizeSourceList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [value].filter(Boolean);
    } catch (err) {
      return [value].filter(Boolean);
    }
  }
  return [value].filter(Boolean);
}

function parseInteger(value, defaultValue, minValue, maxValue) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return defaultValue;
  return Math.min(Math.max(parsed, minValue), maxValue);
}

async function detectHierarchySource() {
  const cachedState = hierarchyCache.get(hierarchySourceStateCacheKey);
  if (cachedState) {
    return cachedState;
  }

  try {
    const result = await pool.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1)`,
      [REQUIRED_HIERARCHY_TABLES]
    );

    const presentTables = new Set(result.rows.map(row => row.table_name));
    const tablesAvailable = REQUIRED_HIERARCHY_TABLES.every(tableName => presentTables.has(tableName));
    const state = {
      mode: tablesAvailable ? 'db' : 'coverage',
      tablesAvailable,
      presentTables: Array.from(presentTables),
      checkedAt: new Date().toISOString(),
    };

    hierarchyCache.set(hierarchySourceStateCacheKey, state);
    return state;
  } catch (err) {
    const fallbackState = {
      mode: 'coverage',
      tablesAvailable: false,
      presentTables: [],
      checkedAt: new Date().toISOString(),
      error: err.message,
    };

    hierarchyCache.set(hierarchySourceStateCacheKey, fallbackState);
    return fallbackState;
  }
}

function mapCoverageState(stateName, stateData = {}) {
  return {
    id: stateName,
    name: stateName,
    cities: Array.isArray(stateData.cities) ? stateData.cities.length : 0,
    sources: normalizeSourceList(stateData.sources || stateData.aqi_sources),
    hasData: Array.isArray(stateData.cities) ? stateData.cities.length > 0 : Boolean(stateData.hasData),
  };
}

function mapCoverageCity(city = {}) {
  return {
    id: city.name,
    name: city.name,
    coordinates: city.coordinates || null,
    source: city.source || 'unknown',
    measurements: city.measurements || 0,
  };
}

function mapDbCountry(row) {
  return {
    id: row.country_name,
    name: row.country_name,
    iso2: row.iso2 || null,
    iso3: row.iso3 || null,
    regions: Number(row.state_count || 0),
    sources: normalizeSourceList(row.aqi_sources),
    hasData: row.has_aqi_data !== false,
    totalMonitoredLocations: Number(row.total_monitored_locations || 0),
    coverageLevel: row.coverage_level || 'none',
    cities: Number(row.city_count || 0),
  };
}

function mapDbState(row) {
  return {
    id: row.state_name,
    name: row.state_name,
    cities: Number(row.city_count || 0),
    sources: normalizeSourceList(row.aqi_sources),
    hasData: row.has_aqi_data !== false,
    stateCode: row.state_code || null,
    regionType: row.region_type || null,
    center: row.center_lat !== null && row.center_lon !== null ? {
      latitude: Number(row.center_lat),
      longitude: Number(row.center_lon),
    } : null,
  };
}

function mapDbCity(row) {
  return {
    id: row.city_name,
    name: row.city_name,
    coordinates: row.latitude !== null && row.longitude !== null ? {
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
    } : null,
    source: normalizeSourceList(row.aqi_sources)[0] || 'unknown',
    sources: normalizeSourceList(row.aqi_sources),
    measurements: Number(row.measurement_count || 0),
    hasData: row.has_aqi_data !== false,
  };
}

async function getCountryDataSource() {
  return detectHierarchySource();
}

async function fetchCountries(limit, offset) {
  const sourceState = await getCountryDataSource();
  if (sourceState.mode === 'db') {
    const totalResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM aqi_countries
       WHERE COALESCE(has_aqi_data, TRUE) = TRUE`
    );
    const rows = await pool.query(
      `SELECT id, country_name, iso2, iso3, aqi_sources, has_aqi_data, total_monitored_locations,
              state_count, city_count, coverage_level
       FROM aqi_countries
       WHERE COALESCE(has_aqi_data, TRUE) = TRUE
       ORDER BY country_name ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return {
      sourceMode: 'db',
      countries: rows.rows.map(mapDbCountry),
      total: totalResult.rows[0]?.total || 0,
    };
  }

  return {
    sourceMode: 'coverage',
    countries: countriesList.slice(offset, offset + limit),
    total: countriesList.length,
  };
}

async function fetchCountryRecord(countryId) {
  const sourceState = await getCountryDataSource();
  if (sourceState.mode === 'db') {
    const result = await pool.query(
      `SELECT id, country_name, iso2, iso3, aqi_sources, has_aqi_data, total_monitored_locations,
              state_count, city_count, coverage_level
       FROM aqi_countries
       WHERE LOWER(country_name) = LOWER($1)
          OR LOWER(COALESCE(iso2, '')) = LOWER($1)
          OR LOWER(COALESCE(iso3, '')) = LOWER($1)
       LIMIT 1`,
      [countryId]
    );

    return result.rows[0] || null;
  }

  return validateCountryId(countryId);
}

async function fetchStates(countryId, limit, offset) {
  const sourceState = await getCountryDataSource();
  if (sourceState.mode === 'db') {
    const countryRow = await fetchCountryRecord(countryId);
    if (!countryRow) {
      return { sourceMode: 'db', country: null, states: [], total: 0 };
    }

    const totalResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM aqi_states
       WHERE country_id = $1`,
      [countryRow.id]
    );
    const rows = await pool.query(
      `SELECT state_name, state_code, region_type, has_aqi_data, aqi_sources, city_count, center_lat, center_lon
       FROM aqi_states
       WHERE country_id = $1
       ORDER BY state_name ASC
       LIMIT $2 OFFSET $3`,
      [countryRow.id, limit, offset]
    );

    return {
      sourceMode: 'db',
      country: countryRow,
      states: rows.rows.map(mapDbState),
      total: totalResult.rows[0]?.total || 0,
    };
  }

  const country = validateCountryId(countryId);
  if (!country) {
    return { sourceMode: 'coverage', country: null, states: [], total: 0 };
  }

  const states = Object.entries(country.regions || {})
    .map(([stateName, stateData]) => mapCoverageState(stateName, stateData))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    sourceMode: 'coverage',
    country,
    states: states.slice(offset, offset + limit),
    total: states.length,
  };
}

async function fetchCities(countryId, stateId, limit, offset) {
  const sourceState = await getCountryDataSource();
  if (sourceState.mode === 'db') {
    const countryRow = await fetchCountryRecord(countryId);
    if (!countryRow) {
      return { sourceMode: 'db', country: null, state: null, cities: [], total: 0 };
    }

    const stateResult = await pool.query(
      `SELECT id, state_name, state_code, region_type, has_aqi_data, aqi_sources, city_count, center_lat, center_lon
       FROM aqi_states
       WHERE country_id = $1
         AND LOWER(state_name) = LOWER($2)
       LIMIT 1`,
      [countryRow.id, stateId]
    );
    const stateRow = stateResult.rows[0] || null;
    if (!stateRow) {
      return { sourceMode: 'db', country: countryRow, state: null, cities: [], total: 0 };
    }

    const totalResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM aqi_cities
       WHERE country_id = $1
         AND state_id = $2`,
      [countryRow.id, stateRow.id]
    );
    const rows = await pool.query(
      `SELECT city_name, latitude, longitude, aqi_sources, has_aqi_data, measurement_count
       FROM aqi_cities
       WHERE country_id = $1
         AND state_id = $2
       ORDER BY city_name ASC
       LIMIT $3 OFFSET $4`,
      [countryRow.id, stateRow.id, limit, offset]
    );

    return {
      sourceMode: 'db',
      country: countryRow,
      state: mapDbState(stateRow),
      cities: rows.rows.map(mapDbCity),
      total: totalResult.rows[0]?.total || 0,
    };
  }

  const country = validateCountryId(countryId);
  if (!country) {
    return { sourceMode: 'coverage', country: null, state: null, cities: [], total: 0 };
  }

  const state = validateStateId(countryId, stateId);
  if (!state) {
    return { sourceMode: 'coverage', country, state: null, cities: [], total: 0 };
  }

  const cities = (state.cities || [])
    .map(city => mapCoverageCity(city))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    sourceMode: 'coverage',
    country,
    state,
    cities: cities.slice(offset, offset + limit),
    total: cities.length,
  };
}

async function searchHierarchy(query, limit, type = null, country = null, state = null) {
  const sourceState = await getCountryDataSource();
  const searchQuery = normalizeSearchText(query);

  if (sourceState.mode === 'db') {
    const results = [];
    const searchPattern = `%${query.trim()}%`;

    if (!type || type === 'country') {
      const countryRows = await pool.query(
        `SELECT country_name, iso2, iso3, state_count, city_count, coverage_level
         FROM aqi_countries
         WHERE country_name ILIKE $1
            OR COALESCE(iso2, '') ILIKE $1
            OR COALESCE(iso3, '') ILIKE $1
         ORDER BY 
           CASE WHEN country_name ILIKE $3 THEN 1 ELSE 2 END,
           country_name ASC
         LIMIT $2`,
        [searchPattern, limit, country || '']
      );
      for (const row of countryRows.rows) {
        results.push({
          type: 'country',
          id: row.country_name,
          name: row.country_name,
          iso2: row.iso2 || null,
          iso3: row.iso3 || null,
          regions: Number(row.state_count || 0),
          cityCount: Number(row.city_count || 0),
          coverageLevel: row.coverage_level || 'none',
          path: row.country_name,
        });
      }
    }

    if ((!type || type === 'state' || type === 'city') && results.length < limit) {
      const stateRows = await pool.query(
        `SELECT ac.country_name, ast.state_name, ast.city_count, ast.region_type
         FROM aqi_states ast
         JOIN aqi_countries ac ON ac.id = ast.country_id
         WHERE ast.state_name ILIKE $1
         ORDER BY 
           CASE WHEN ac.country_name ILIKE $3 THEN 1 ELSE 2 END,
           ac.country_name ASC, 
           ast.state_name ASC
         LIMIT $2`,
        [searchPattern, limit - results.length, country || '']
      );
      for (const row of stateRows.rows) {
        if (results.length >= limit) break;
        if (!type || type === 'state') {
          results.push({
            type: 'state',
            id: row.state_name,
            name: row.state_name,
            country: row.country_name,
            cities: Number(row.city_count || 0),
            regionType: row.region_type || null,
            path: `${row.country_name} > ${row.state_name}`,
          });
        }
      }

      if (!type || type === 'city') {
        const cityRows = await pool.query(
          `SELECT ac.country_name, ast.state_name, aci.city_name, aci.latitude, aci.longitude, aci.aqi_sources
           FROM aqi_cities aci
           JOIN aqi_states ast ON ast.id = aci.state_id
           JOIN aqi_countries ac ON ac.id = aci.country_id
           WHERE aci.city_name ILIKE $1
           ORDER BY 
             CASE WHEN ac.country_name ILIKE $3 THEN 1 ELSE 2 END,
             CASE WHEN ast.state_name ILIKE $4 THEN 1 ELSE 2 END,
             ac.country_name ASC, 
             ast.state_name ASC, 
             aci.city_name ASC
           LIMIT $2`,
          [searchPattern, limit - results.length, country || '', state || '']
        );
        for (const row of cityRows.rows) {
          if (results.length >= limit) break;
          results.push({
            type: 'city',
            id: row.city_name,
            name: row.city_name,
            country: row.country_name,
            state: row.state_name,
            coordinates: row.latitude !== null && row.longitude !== null ? {
              latitude: Number(row.latitude),
              longitude: Number(row.longitude),
            } : null,
            sources: normalizeSourceList(row.aqi_sources),
            path: `${row.country_name} > ${row.state_name} > ${row.city_name}`,
          });
        }
      }
    }

    return { sourceMode: 'db', searchNormalized: searchQuery, results, total: results.length };
  }

  const results = [];

  if (!type || type === 'country') {
    countriesList.forEach(countryItem => {
      if (results.length >= limit) return;
      const normalized = normalizeSearchText(countryItem.name);
      if (normalized.includes(searchQuery) || searchQuery.includes(normalized)) {
        results.push({
          type: 'country',
          id: countryItem.id,
          name: countryItem.name,
          iso2: countryItem.iso2,
          regions: countryItem.regions,
          path: countryItem.name,
        });
      }
    });
  }

  if ((!type || type === 'state' || type === 'city') && results.length < limit) {
    countriesList.forEach(countryItem => {
      if (results.length >= limit) return;
      const countryData = coverageData[countryItem.name] || {};
      const regions = countryData.regions || {};

      Object.entries(regions).forEach(([stateName, stateData]) => {
        if (results.length >= limit) return;

        if (!type || type === 'state') {
          const stateNormalized = normalizeSearchText(stateName);
          if (stateNormalized.includes(searchQuery) || searchQuery.includes(stateNormalized)) {
            results.push({
              type: 'state',
              id: stateName,
              name: stateName,
              country: countryItem.name,
              cities: (stateData.cities || []).length,
              path: `${countryItem.name} > ${stateName}`,
            });
          }
        }

        if ((!type || type === 'city') && results.length < limit) {
          (stateData.cities || []).forEach(city => {
            if (results.length >= limit) return;
            const cityNormalized = normalizeSearchText(city.name);
            if (cityNormalized.includes(searchQuery) || searchQuery.includes(cityNormalized)) {
              results.push({
                type: 'city',
                id: city.name,
                name: city.name,
                country: countryItem.name,
                state: stateName,
                coordinates: city.coordinates || null,
                source: city.source || 'unknown',
                path: `${countryItem.name} > ${stateName} > ${city.name}`,
              });
            }
          });
        }
      });
    });
  }

  if (country || state) {
    results.sort((a, b) => {
      if (country) {
        const aCountryMatch = a.country && a.country.toLowerCase() === country.toLowerCase();
        const bCountryMatch = b.country && b.country.toLowerCase() === country.toLowerCase();
        if (aCountryMatch && !bCountryMatch) return -1;
        if (!aCountryMatch && bCountryMatch) return 1;
      }
      if (state) {
        const aStateMatch = a.state && a.state.toLowerCase() === state.toLowerCase();
        const bStateMatch = b.state && b.state.toLowerCase() === state.toLowerCase();
        if (aStateMatch && !bStateMatch) return -1;
        if (!aStateMatch && bStateMatch) return 1;
      }
      return 0;
    });
  }

  return { sourceMode: 'coverage', searchNormalized: searchQuery, results, total: results.length };
}

async function buildValidationMetadata() {
  const sourceState = await getCountryDataSource();
  if (sourceState.mode === 'db') {
    const countryCounts = await pool.query(`
      SELECT
        COUNT(*)::int AS total_countries,
        COUNT(*) FILTER (WHERE COALESCE(has_aqi_data, TRUE) = TRUE)::int AS countries_with_data,
        COUNT(*) FILTER (WHERE COALESCE(has_aqi_data, TRUE) = TRUE AND COALESCE(city_count, 0) > 0)::int AS countries_with_city_counts
      FROM aqi_countries
    `);
    const stateCounts = await pool.query(`SELECT COUNT(*)::int AS total_states FROM aqi_states`);
    const cityCounts = await pool.query(`SELECT COUNT(*)::int AS total_cities FROM aqi_cities`);

    return {
      sourceMode: 'db',
      totalCountries: countryCounts.rows[0]?.total_countries || 0,
      countriesWithData: countryCounts.rows[0]?.countries_with_data || 0,
      countriesPartialCoverage: Math.max((countryCounts.rows[0]?.total_countries || 0) - (countryCounts.rows[0]?.countries_with_data || 0), 0),
      totalStates: stateCounts.rows[0]?.total_states || 0,
      totalCities: cityCounts.rows[0]?.total_cities || 0,
      cacheStatus: 'active',
      ttl: 300,
      tablesAvailable: true,
      presentTables: sourceState.presentTables,
      checkedAt: sourceState.checkedAt,
    };
  }

  return {
    sourceMode: 'coverage',
    totalCountries: countriesList.length,
    countriesWithData: countriesList.filter(c => c.hasData).length,
    countriesPartialCoverage: countriesList.filter(c => !c.hasData).length,
    totalStates: Object.values(coverageData).reduce((sum, country) => sum + Object.keys(country.regions || {}).length, 0),
    totalCities: Object.values(coverageData).reduce((sum, country) => {
      return sum + Object.values(country.regions || {}).reduce((stateSum, state) => stateSum + (Array.isArray(state.cities) ? state.cities.length : 0), 0);
    }, 0),
    cacheStatus: 'active',
    ttl: 300,
    tablesAvailable: false,
    presentTables: sourceState.presentTables,
    checkedAt: sourceState.checkedAt,
  };
}

// Helper: Normalize search text for matching
function normalizeSearchText(text = '') {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Helper: Validate country ID exists
function validateCountryId(countryId) {
  if (!countryId) return null;
  const country = coverageData[countryId];
  if (!country || typeof country !== 'object') {
    return null;
  }
  return country;
}

// Helper: Validate state ID exists for a country
function validateStateId(countryId, stateId) {
  const country = validateCountryId(countryId);
  if (!country) return null;
  
  const state = country.regions && country.regions[stateId];
  if (!state || typeof state !== 'object') {
    return null;
  }
  return state;
}

// Helper: Format pagination error response
function formatPaginationError(message) {
  return {
    error: message,
    empty: true,
    message,
    data: []
  };
}

/**
 * GET /api/hierarchy/countries
 * Returns all countries with AQI data, sorted alphabetically
 * 
 * Query params:
 * - limit: max results (default 100, max 1000)
 * - offset: skip N results (default 0)
 * 
 * Response: { countries: [...], total: N, cached: boolean }
 */
router.get('/countries', async (req, res) => {
  try {
    const sourceState = await getCountryDataSource();
    const cacheKey = `hierarchy_countries_list_${sourceState.mode}`;
    let cached = hierarchyCache.get(cacheKey);
    if (cached) {
      return res.json({
        countries: cached.countries,
        total: cached.total,
        cached: true,
        cacheTimestamp: new Date().toISOString()
      });
    }

    const limit = parseInteger(req.query.limit, 100, 1, 1000);
    const offset = parseInteger(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);

    const responseData = await fetchCountries(limit, offset);
    const response = {
      countries: responseData.countries,
      total: responseData.total,
      limit,
      offset,
      sourceMode: responseData.sourceMode,
      cached: false
    };

    // Cache the full list (pagination variations not cached)
    if (offset === 0 && limit >= responseData.total) {
      hierarchyCache.set(cacheKey, { countries: responseData.countries, total: responseData.total });
    }

    res.json(response);
  } catch (err) {
    console.error('Hierarchy /countries error:', err.message);
    res.status(500).json({
      error: 'Failed to retrieve countries',
      details: err.message,
      empty: true
    });
  }
});

/**
 * GET /api/hierarchy/countries/:countryId/states
 * Returns states/regions for a country
 * 
 * Params:
 * - countryId: country name (e.g., "India", "United States")
 * 
 * Query params:
 * - limit: max results (default 100, max 1000)
 * - offset: skip N results (default 0)
 * 
 * Response: { countryId, states: [...], total: N } or { empty: true, message: "..." }
 */
router.get('/countries/:countryId/states', async (req, res) => {
  try {
    const { countryId } = req.params;
    
    if (!countryId) {
      return res.status(400).json({
        error: 'countryId is required',
        empty: true
      });
    }

    const sourceState = await getCountryDataSource();
    const cacheKey = `hierarchy_states_${sourceState.mode}_${countryId}`;
    let cached = hierarchyCache.get(cacheKey);
    if (cached) {
      return res.json({
        ...cached,
        cached: true,
        cacheTimestamp: new Date().toISOString()
      });
    }

    const limit = parseInteger(req.query.limit, 100, 1, 1000);
    const offset = parseInteger(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);

    const responseData = await fetchStates(countryId, limit, offset);
    if (!responseData.country) {
      return res.json({
        empty: true,
        message: `Country '${countryId}' not found or has no AQI coverage data`,
        countryId,
        states: [],
        total: 0
      });
    }

    const response = {
      countryId,
      countryName: countryId,
      states: responseData.states,
      total: responseData.total,
      limit,
      offset,
      sourceMode: responseData.sourceMode
    };

    // Cache full state list
    if (offset === 0 && limit >= responseData.total) {
      hierarchyCache.set(cacheKey, response);
    }

    res.json(response);
  } catch (err) {
    console.error('Hierarchy /states error:', err.message);
    res.status(500).json({
      error: 'Failed to retrieve states',
      details: err.message,
      empty: true
    });
  }
});

/**
 * GET /api/hierarchy/countries/:countryId/states/:stateId/cities
 * Returns cities for a state, with pagination
 * 
 * Params:
 * - countryId: country name
 * - stateId: state name
 * 
 * Query params:
 * - limit: max results (default 50, max 500)
 * - offset: skip N results (default 0)
 * 
 * Response: { countryId, stateId, cities: [...], total: N } or { empty: true }
 */
router.get('/countries/:countryId/states/:stateId/cities', async (req, res) => {
  try {
    const { countryId, stateId } = req.params;

    if (!countryId || !stateId) {
      return res.status(400).json({
        error: 'countryId and stateId are required',
        empty: true
      });
    }

    const limit = parseInteger(req.query.limit, 50, 1, 500);
    const offset = parseInteger(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);

    const responseData = await fetchCities(countryId, stateId, limit, offset);
    if (!responseData.country || !responseData.state) {
      return res.json({
        empty: true,
        message: `State '${stateId}' not found in country '${countryId}'`,
        countryId,
        stateId,
        cities: [],
        total: 0
      });
    }

    // Check bounds
    if (offset >= responseData.total && responseData.total > 0) {
      return res.json(
        formatPaginationError(`Offset ${offset} exceeds total cities (${responseData.total})`)
      );
    }

    res.json({
      countryId,
      countryName: countryId,
      stateId,
      stateName: stateId,
      cities: responseData.cities,
      total: responseData.total,
      limit,
      offset,
      hasMore: offset + limit < responseData.total,
      sourceMode: responseData.sourceMode
    });
  } catch (err) {
    console.error('Hierarchy /cities error:', err.message);
    res.status(500).json({
      error: 'Failed to retrieve cities',
      details: err.message,
      empty: true
    });
  }
});

/**
 * GET /api/hierarchy/search
 * Search across countries, states, and cities
 * 
 * Query params:
 * - q: search query (required, min 1 char)
 * - limit: max results (default 20, max 100)
 * - type: filter by type ('country', 'state', 'city', or omit for all)
 * 
 * Response: { query, results: [...], total: N }
 */
router.get('/search', async (req, res) => {
  try {
    const { q, limit: limitStr, type, country, state } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return res.status(400).json({
        error: 'Search query (q) is required and must be at least 1 character',
        results: [],
        total: 0
      });
    }

    const limit = parseInteger(limitStr, 20, 1, 100);
    const responseData = await searchHierarchy(q, limit, type || null, country || null, state || null);

    res.json({
      query: q,
      searchNormalized: responseData.searchNormalized,
      results: responseData.results.slice(0, limit),
      total: responseData.results.length,
      limit,
      sourceMode: responseData.sourceMode
    });
  } catch (err) {
    console.error('Hierarchy /search error:', err.message);
    res.status(500).json({
      error: 'Search failed',
      details: err.message,
      results: [],
      total: 0
    });
  }
});

/**
 * POST /api/hierarchy/validate
 * Trigger re-verification of hierarchy data (optional)
 * Returns current coverage status without re-fetching
 * 
 * Response: { status: 'ok', timestamp, countries: N, hasData: N }
 */
router.post('/validate', async (req, res) => {
  try {
    const metadata = await buildValidationMetadata();

    res.json({
      status: 'ok',
      message: 'Hierarchy validation complete',
      timestamp: new Date().toISOString(),
      metadata
    });
  } catch (err) {
    console.error('Hierarchy /validate error:', err.message);
    res.status(500).json({
      error: 'Validation failed',
      details: err.message
    });
  }
});

module.exports = router;
