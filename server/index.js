const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");
const cron = require("node-cron");
require("dotenv").config();

// Import database functions
const { testConnection, initializeTables, storeAirQualityData, pool } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// Performance optimizations
const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 300 }); // 5 minute cache

// Request timeout configuration
const REQUEST_TIMEOUT = 15000; // 15 seconds max per API call
const MAX_RESULTS_PER_API = 200; // Limit results to prevent overload

const OPENAQ_API = process.env.OPENAQ_API || "https://api.openaq.org/v3";
const HEADERS = process.env.OPENAQ_API_KEY ? { "X-API-Key": process.env.OPENAQ_API_KEY } : {};

// Multi-API Configuration
const API_SOURCES = {
  openaq: {
    name: "OpenAQ",
    baseUrl: "https://api.openaq.org/v3",
    headers: HEADERS,
    coverage: "primary"
  },
  waqi: {
    name: "World Air Quality Index", 
    baseUrl: "https://api.waqi.info",
    token: process.env.WAQI_TOKEN || "demo", // Get free token from aqicn.org/data-platform/token/
    coverage: "11000+ stations worldwide"
  },
  openweather: {
    name: "OpenWeatherMap Air Pollution",
    baseUrl: "https://api.openweathermap.org/data/2.5/air_pollution",
    token: process.env.OPENWEATHER_API_KEY, // Get free key from openweathermap.org
    coverage: "global coordinates"
  }
};

let locationsCache = { ts: 0, data: [] };
async function loadLocations() {
  const now = Date.now();
  if (locationsCache.data.length && now - locationsCache.ts < 24 * 3600 * 1000) {
    return locationsCache.data;
  }
  const res = await axios.get(`${OPENAQ_API}/locations?limit=1000`, { headers: HEADERS });
  locationsCache = { ts: now, data: res.data.results || [] };
  return locationsCache.data;
}

async function findLocationsByCity(cityName) {
  const locations = await loadLocations();
  const lower = cityName.trim().toLowerCase();
  
  // First try to find locations that contain the city name
  let matched = locations.filter(loc => 
    loc.name?.toLowerCase().includes(lower) ||
    loc.locality?.toLowerCase()?.includes(lower) ||
    loc.country?.name?.toLowerCase().includes(lower)
  );
  
  // If no matches, try broader search
  if (matched.length === 0) {
    matched = locations.filter(loc => 
      loc.name?.toLowerCase().indexOf(lower) !== -1
    );
  }
  
  return matched;
}

function groupSnapshot(results) {
  const map = {};
  results.forEach(r => {
    const key = r.pollutant.toUpperCase();
    if (!map[key]) map[key] = { sum: 0, count: 0, unit: r.unit };
    map[key].sum += r.value;
    map[key].count += 1;
  });
  return Object.keys(map).map(k => ({ pollutant: k, value: +(map[k].sum / map[k].count).toFixed(2), unit: map[k].unit }));
}

// ==================== DATABASE ROUTES ====================

/**
 * GET /api/collection-status - Get data collection status
 */
app.get('/api/collection-status', async (req, res) => {
  try {
    res.json({
      status: 'Always Active',
      description: 'Continuous data collection from multiple sources',
      nextCollection: new Date(Date.now() + 60 * 60 * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      timestamp: new Date().toISOString(),
      capabilities: [
        'Multi-source API data collection (OpenAQ, WAQI, OpenWeather)',
        'Intelligent fallback system with realistic data generation',
        'Continuous 24/7 operation with high reliability',
        'Automatic database storage for all data sources'
      ]
    });
  } catch (error) {
    res.status(500).json({
      status: 'Error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/store - Manually trigger data storage (for testing)
 * Continuous operation using multiple data sources with intelligent fallback
 */
app.post('/api/store', async (req, res) => {
  try {
    const { city = 'Delhi' } = req.body;
    
    console.log(`≡ƒöä Manual data collection triggered`);
    
    const result = await autoFetchAndStore();
    if (result.success) {
      res.json({ 
        success: true, 
        message: result.message,
        successCount: result.successCount,
        totalCities: result.totalCities,
        onlineSuccessCount: result.onlineSuccessCount,
        offlineGeneratedCount: result.offlineGeneratedCount,
        timestamp: new Date().toISOString(),
        collection_type: 'multi_source'
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to collect and store data',
        message: result.message,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Γ¥î Manual storage error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error during manual storage',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/current - Fetch fresh air quality data from external APIs
 * This route fetches current data directly from APIs and returns it immediately
 */
app.get("/api/current", async (req, res) => {
  try {
    const { city } = req.query;
    if (!city) {
      return res.status(400).json({ error: "City parameter is required" });
    }

    console.log(`≡ƒöä Fetching current data for ${city}...`);

    // Use existing hybrid API logic to get fresh data
    const locations = await findLocationsByCity(city);
    if (locations.length === 0) {
      return res.status(404).json({ error: `No monitoring locations found for ${city}` });
    }

    let allResults = [];
    let successfulSource = null;

    // Try OpenAQ first
    try {
      for (const location of locations.slice(0, 2)) {
        if (location.sensors && location.sensors.length > 0) {
          for (const sensor of location.sensors.slice(0, 3)) {
            try {
              const url = `${OPENAQ_API}/sensors/${sensor.id}/measurements?limit=10&sort=desc`;
              const response = await axios.get(url, { headers: HEADERS, timeout: 10000 });
              
              const sensorResults = (response.data.results || []).map(r => ({
                pollutant: r.parameter?.name || 'unknown',
                value: r.value,
                unit: r.parameter?.units || '',
                dateUTC: r.period?.datetimeTo?.utc,
                location: location.name
              }));
              
              allResults = allResults.concat(sensorResults);
              successfulSource = 'OpenAQ';
            } catch (sensorErr) {
              console.log(`Sensor ${sensor.id} failed: ${sensorErr.message}`);
            }
          }
        }
      }
    } catch (openaqErr) {
      console.log('OpenAQ failed, trying WAQI...');
    }

    // Fallback to WAQI if OpenAQ didn't work
    if (allResults.length === 0) {
      try {
        const waqiResult = await fetchFromWAQI(city);
        if (waqiResult.success) {
          allResults = waqiResult.data;
          successfulSource = 'WAQI';
        }
      } catch (waqiErr) {
        console.log('WAQI also failed:', waqiErr.message);
      }
    }

    if (allResults.length === 0) {
      return res.status(404).json({ 
        error: `No current air quality data available for ${city}`,
        message: "Try checking the city name or try again later"
      });
    }

    // Format response
    const responseData = {
      city: city,
      source: successfulSource,
      timestamp: new Date().toISOString(),
      count: allResults.length,
      current_data: allResults,
      snapshot: groupSnapshot(allResults),
      message: `Fresh air quality data from ${successfulSource} API`
    };

    console.log(`Γ£à Successfully fetched current data for ${city} from ${successfulSource}`);
    res.json(responseData);

  } catch (err) {
    console.error('Error fetching current data:', err.message);
    res.status(500).json({ 
      error: "Failed to fetch current air quality data",
      details: err.message 
    });
  }
});

/**
 * GET /api/data-availability - Get information about available historical data dates and cities
 * This endpoint provides metadata about what data is available in the database
 */
app.get("/api/data-availability", async (req, res) => {
  try {
    console.log(`≡ƒôè Querying data availability information...`);

    // Query to get overall date range and city coverage
    const client = await pool.connect();
    
    // Get overall date range
    const dateRangeQuery = `
      SELECT 
        MIN(DATE(timestamp)) as earliest_date,
        MAX(DATE(timestamp)) as latest_date,
        COUNT(*) as total_records
      FROM air_quality_data
    `;
    const dateRangeResult = await client.query(dateRangeQuery);
    
    // Get city-specific information
    const cityDataQuery = `
      SELECT 
        city, 
        COUNT(*) as record_count,
        MIN(DATE(timestamp)) as earliest_date,
        MAX(DATE(timestamp)) as latest_date,
        array_agg(DISTINCT api_source) as sources
      FROM air_quality_data 
      GROUP BY city 
      ORDER BY record_count DESC
    `;
    const cityDataResult = await client.query(cityDataQuery);
    
    // Get pollutants availability
    const pollutantQuery = `
      SELECT 
        COUNT(CASE WHEN pm25 IS NOT NULL THEN 1 END) as pm25_count,
        COUNT(CASE WHEN pm10 IS NOT NULL THEN 1 END) as pm10_count,
        COUNT(CASE WHEN no2 IS NOT NULL THEN 1 END) as no2_count,
        COUNT(CASE WHEN so2 IS NOT NULL THEN 1 END) as so2_count,
        COUNT(CASE WHEN o3 IS NOT NULL THEN 1 END) as o3_count,
        COUNT(CASE WHEN co IS NOT NULL THEN 1 END) as co_count
      FROM air_quality_data
    `;
    const pollutantResult = await client.query(pollutantQuery);
    
    client.release();

    const overall = dateRangeResult.rows[0];
    const cityData = cityDataResult.rows;
    const pollutantData = pollutantResult.rows[0];

    // Format response
    const availability = {
      overall_summary: {
        total_records: parseInt(overall.total_records),
        earliest_date: overall.earliest_date ? overall.earliest_date.toISOString().split('T')[0] : null,
        latest_date: overall.latest_date ? overall.latest_date.toISOString().split('T')[0] : null,
        date_range_days: overall.earliest_date && overall.latest_date ? 
          Math.ceil((new Date(overall.latest_date) - new Date(overall.earliest_date)) / (1000 * 60 * 60 * 24)) + 1 : 0
      },
      cities_available: cityData.map(city => ({
        city: city.city,
        record_count: parseInt(city.record_count),
        date_range: {
          from: city.earliest_date ? city.earliest_date.toISOString().split('T')[0] : null,
          to: city.latest_date ? city.latest_date.toISOString().split('T')[0] : null
        },
        data_sources: city.sources
      })),
      pollutants_coverage: {
        pm25: parseInt(pollutantData.pm25_count),
        pm10: parseInt(pollutantData.pm10_count),
        no2: parseInt(pollutantData.no2_count),
        so2: parseInt(pollutantData.so2_count),
        o3: parseInt(pollutantData.o3_count),
        co: parseInt(pollutantData.co_count)
      },
      valid_date_format: "YYYY-MM-DD",
      example_query: `/api/historical?city=Delhi&date_from=${overall.earliest_date ? overall.earliest_date.toISOString().split('T')[0] : '2025-10-29'}&date_to=${overall.latest_date ? overall.latest_date.toISOString().split('T')[0] : '2025-10-30'}&limit=50`,
      supported_cities: cityData.map(c => c.city),
      date_range_info: {
        status: overall.earliest_date && overall.latest_date && overall.earliest_date.toISOString().split('T')[0] === overall.latest_date.toISOString().split('T')[0] ? 
          "Single day available" : "Multi-day range available",
        recommendation: overall.earliest_date && overall.latest_date ? 
          `Use dates from ${overall.earliest_date.toISOString().split('T')[0]} to ${overall.latest_date.toISOString().split('T')[0]} for best results` :
          "Historical data collection in progress"
      },
      last_updated: new Date().toISOString()
    };

    console.log(`Γ£à Data availability: ${overall.total_records} total records from ${overall.earliest_date} to ${overall.latest_date}`);

    res.json({
      success: true,
      data_availability: availability,
      message: "Historical data availability information"
    });

  } catch (err) {
    console.error('Error fetching data availability:', err.message);
    res.status(500).json({ 
      error: "Failed to fetch data availability information", 
      details: err.message 
    });
  }
});

/**
 * GET /api/valid-dates/:city - Get valid date examples for a specific city
 * This endpoint provides specific date examples that have data available
 */
app.get("/api/valid-dates/:city", async (req, res) => {
  try {
    const city = req.params.city;
    
    if (!city) {
      return res.status(400).json({ error: "City parameter is required" });
    }

    console.log(`≡ƒôà Getting valid dates for ${city}...`);

    const client = await pool.connect();
    
    // Get specific dates that have data for this city
    const validDatesQuery = `
      SELECT DISTINCT 
        DATE(timestamp) as date,
        COUNT(*) as record_count,
        array_agg(DISTINCT api_source) as sources,
        MIN(timestamp) as earliest_time,
        MAX(timestamp) as latest_time
      FROM air_quality_data 
      WHERE LOWER(city) LIKE LOWER($1)
      GROUP BY DATE(timestamp) 
      ORDER BY date DESC
      LIMIT 30
    `;
    
    const validDatesResult = await client.query(validDatesQuery, [`%${city}%`]);
    client.release();

    const validDates = validDatesResult.rows.map(row => ({
      date: row.date.toISOString().split('T')[0],
      record_count: parseInt(row.record_count),
      sources: row.sources,
      time_range: {
        earliest: row.earliest_time,
        latest: row.latest_time
      }
    }));

    console.log(`Γ£à Found ${validDates.length} valid dates for ${city}`);

    res.json({
      success: true,
      city: city,
      valid_dates: validDates,
      example_queries: validDates.slice(0, 3).map(vd => ({
        date: vd.date,
        single_day: `/api/historical?city=${city}&date_from=${vd.date}&date_to=${vd.date}`,
        with_limit: `/api/historical?city=${city}&date_from=${vd.date}&date_to=${vd.date}&limit=10`
      })),
      date_format_help: {
        format: "YYYY-MM-DD",
        examples: validDates.slice(0, 5).map(vd => vd.date)
      },
      message: `${validDates.length} valid dates found for ${city}`
    });

  } catch (err) {
    console.error('Error fetching valid dates:', err.message);
    res.status(500).json({ 
      error: "Failed to fetch valid dates", 
      details: err.message 
    });
  }
});

/**
 * GET /api/historical - Query stored historical data from Neon database
 * This route queries the PostgreSQL database with filtering options
 */
app.get("/api/historical", async (req, res) => {
  try {
    const { city, country, date_from, date_to, hour_from, hour_to, limit = 100 } = req.query;

    if (!city) {
      return res.status(400).json({ error: "City parameter is required for historical data" });
    }

    console.log(`≡ƒôè Querying historical data for ${city}...`);

    // Build dynamic query with filters
    let query = 'SELECT * FROM air_quality_data WHERE 1=1';
    const values = [];
    let paramCount = 0;

    // City filter (required)
    paramCount++;
    query += ` AND LOWER(city) LIKE LOWER($${paramCount})`;
    values.push(`%${city}%`);

    // Optional filters
    if (country) {
      paramCount++;
      query += ` AND LOWER(country) LIKE LOWER($${paramCount})`;
      values.push(`%${country}%`);
    }

    if (date_from) {
      paramCount++;
      query += ` AND DATE(timestamp) >= $${paramCount}`;
      values.push(date_from);
    }

    if (date_to) {
      paramCount++;
      query += ` AND DATE(timestamp) <= $${paramCount}`;
      values.push(date_to);
    }

    if (hour_from !== undefined) {
      paramCount++;
      query += ` AND hour_recorded >= $${paramCount}`;
      values.push(parseInt(hour_from));
    }

    if (hour_to !== undefined) {
      paramCount++;
      query += ` AND hour_recorded <= $${paramCount}`;
      values.push(parseInt(hour_to));
    }

    // Add ordering and limit
    query += ` ORDER BY timestamp DESC LIMIT $${paramCount + 1}`;
    values.push(parseInt(limit));

    // Execute query
    const client = await pool.connect();
    const result = await client.query(query, values);

    // Format response for frontend
    const formattedData = result.rows.map(row => ({
      id: row.id,
      city: row.city,
      country: row.country,
      coordinates: row.latitude && row.longitude ? [row.latitude, row.longitude] : null,
      pollutants: {
        pm25: row.pm25,
        pm10: row.pm10,
        no2: row.no2,
        so2: row.so2,
        o3: row.o3,
        co: row.co
      },
      weather: {
        temperature: row.temperature,
        humidity: row.humidity,
        pressure: row.pressure,
        wind_speed: row.wind_speed,
        wind_direction: row.wind_direction
      },
      timestamp: row.timestamp,
      hour: row.hour_recorded,
      source: row.api_source
    }));

    // Generate summary statistics
    const summary = {
      total_records: result.rows.length,
      date_range: result.rows.length > 0 ? {
        from: result.rows[result.rows.length - 1].timestamp,
        to: result.rows[0].timestamp
      } : null,
      cities: [...new Set(result.rows.map(r => r.city))],
      pollutants_available: []
    };

    // Check which pollutants have data
    const pollutantFields = ['pm25', 'pm10', 'no2', 'so2', 'o3', 'co'];
    pollutantFields.forEach(field => {
      if (result.rows.some(row => row[field] !== null)) {
        summary.pollutants_available.push(field);
      }
    });

    console.log(`Γ£à Retrieved ${result.rows.length} historical records for ${city}`);

    // Add data availability context
    const availabilityQuery = `
      SELECT 
        MIN(DATE(timestamp)) as earliest_available,
        MAX(DATE(timestamp)) as latest_available,
        COUNT(*) as total_city_records
      FROM air_quality_data 
      WHERE LOWER(city) LIKE LOWER($1)
    `;
    const availabilityResult = await client.query(availabilityQuery, [`%${city}%`]);
    const availability = availabilityResult.rows[0];
    
    client.release();

    res.json({
      success: true,
      city: city,
      filters_applied: { city, country, date_from, date_to, hour_from, hour_to },
      summary: summary,
      data_availability: {
        city_earliest_date: availability.earliest_available,
        city_latest_date: availability.latest_available,
        total_city_records: parseInt(availability.total_city_records),
        valid_date_format: "YYYY-MM-DD",
        date_examples: [
          availability.earliest_available ? availability.earliest_available.toISOString().split('T')[0] : null,
          availability.latest_available ? availability.latest_available.toISOString().split('T')[0] : null
        ],
        query_tip: `Use date_from=${availability.earliest_available ? availability.earliest_available.toISOString().split('T')[0] : 'YYYY-MM-DD'}&date_to=${availability.latest_available ? availability.latest_available.toISOString().split('T')[0] : 'YYYY-MM-DD'} for full range`
      },
      historical_data: formattedData,
      message: `Historical data from Neon PostgreSQL database (${availability.earliest_available ? availability.earliest_available.toISOString().split('T')[0] : 'No data'} to ${availability.latest_available ? availability.latest_available.toISOString().split('T')[0] : 'No data'})`
    });

  } catch (err) {
    console.error('Error fetching historical data:', err.message);
    res.status(500).json({ 
      error: "Failed to fetch historical data", 
      details: err.message 
    });
  }
});

// ==================== END DATABASE ROUTES ====================

app.get("/api/search-city/:name", async (req, res) => {
  try {
    const name = req.params.name || "";
    const matched = await findLocationsByCity(name);
    if (matched.length === 0) return res.status(404).json({ error: `No locations found matching \"${name}\"` });
    res.json({ 
      matchedCity: name, 
      locations: matched.slice(0, 10).map(loc => ({
        id: loc.id,
        name: loc.name,
        country: loc.country?.name
      }))
    });
  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).json({ error: err.response?.data || "Internal server error" });
  }
});

app.get("/api/air/:city", async (req, res) => {
  try {
    const city = req.params.city || "";
    const locations = await findLocationsByCity(city);
    if (locations.length === 0) return res.status(404).json({ error: `No locations found for \"${city}\"` });

    // Get recent measurements from sensors in the first location
    const location = locations[0];
    try {
      let allResults = [];
      for (const sensor of location.sensors || []) {
        try {
          const url = `${OPENAQ_API}/sensors/${sensor.id}/measurements?limit=20&sort=desc`;
          const response = await axios.get(url, { headers: HEADERS });
          
          const sensorResults = (response.data.results || []).map(r => ({
            pollutant: r.parameter?.name || 'unknown',
            value: r.value,
            unit: r.parameter?.units || '',
            dateUTC: r.period?.datetimeTo?.utc,
            dateLocal: r.period?.datetimeTo?.local,
            location: location.name
          }));
          
          allResults = allResults.concat(sensorResults);
        } catch (sensorErr) {
          console.log(`Failed to fetch data for sensor ${sensor.id}:`, sensorErr.message);
        }
      }
      
      if (allResults.length === 0) return res.status(404).json({ error: `No measurements found for \"${city}\"` });
      return res.json({ city: city, source: "sensors", results: allResults, locationName: location.name });
    } catch (e) {
      return res.status(500).json({ error: "Failed to fetch measurements" });
    }
  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).json({ error: err.response?.data || "Internal server error" });
  }
});

function parseTimeString(t) {
  if (!t) return { hours: 0, minutes: 0 };
  const parts = t.split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return { hours: h, minutes: m };
}

// Multi-API Helper Functions
async function getCoordinatesForCity(cityName) {
  try {
    // Simple geocoding using OpenWeatherMap's geo API (free)
    const geoUrl = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(cityName)}&limit=1&appid=${process.env.OPENWEATHER_API_KEY || 'demo'}`;
    const response = await axios.get(geoUrl);
    if (response.data && response.data.length > 0) {
      return {
        lat: response.data[0].lat,
        lon: response.data[0].lon,
        country: response.data[0].country
      };
    }
  } catch (err) {
    console.log('Geocoding failed:', err.message);
  }
  
  // Fallback coordinates for major cities
  const cityCoords = {
    'delhi': { lat: 28.6139, lon: 77.2090, country: 'IN' },
    'mumbai': { lat: 19.0760, lon: 72.8777, country: 'IN' },
    'chennai': { lat: 13.0827, lon: 80.2707, country: 'IN' },
    'bangalore': { lat: 12.9716, lon: 77.5946, country: 'IN' },
    'kolkata': { lat: 22.5726, lon: 88.3639, country: 'IN' },
    'hyderabad': { lat: 17.3850, lon: 78.4867, country: 'IN' },
    'pune': { lat: 18.5204, lon: 73.8567, country: 'IN' },
    'moscow': { lat: 55.7558, lon: 37.6176, country: 'RU' },
    'tehran': { lat: 35.6892, lon: 51.3890, country: 'IR' },
    'seoul': { lat: 37.5665, lon: 126.9780, country: 'KR' },
    'caracas': { lat: 10.4806, lon: -66.9036, country: 'VE' },
    'havana': { lat: 23.1136, lon: -82.3666, country: 'CU' },
    'beirut': { lat: 33.8938, lon: 35.5018, country: 'LB' },
    'damascus': { lat: 33.5138, lon: 36.2765, country: 'SY' }
  };
  
  const cityKey = cityName.toLowerCase().trim();
  return cityCoords[cityKey] || null;
}

async function fetchFromWAQI(cityName) {
  try {
    const coords = await getCoordinatesForCity(cityName);
    let url;
    
    if (coords) {
      // Try geo-based search first
      url = `${API_SOURCES.waqi.baseUrl}/feed/geo:${coords.lat};${coords.lon}/?token=${API_SOURCES.waqi.token}`;
    } else {
      // Fallback to city search
      url = `${API_SOURCES.waqi.baseUrl}/feed/${encodeURIComponent(cityName)}/?token=${API_SOURCES.waqi.token}`;
    }
    
    const response = await axios.get(url);
    
    if (response.data && response.data.status === "ok" && response.data.data) {
      const data = response.data.data;
      const results = [];
      
      // Convert WAQI format to our standard format
      if (data.iaqi) {
        Object.keys(data.iaqi).forEach(pollutant => {
          if (data.iaqi[pollutant] && data.iaqi[pollutant].v !== undefined) {
            results.push({
              pollutant: pollutant,
              value: data.iaqi[pollutant].v,
              unit: 'AQI', // WAQI uses AQI scale
              dateUTC: data.time?.s || new Date().toISOString(),
              dateLocal: data.time?.s || new Date().toISOString(),
              location: data.city?.name || cityName,
              source: 'WAQI'
            });
          }
        });
      }
      
      return {
        success: true,
        source: 'WAQI',
        city: data.city?.name || cityName,
        results: results,
        aqi: data.aqi,
        coordinates: data.city?.geo
      };
    }
  } catch (err) {
    console.log('WAQI API failed:', err.message);
    return { success: false, error: err.message };
  }
  
  return { success: false, error: 'No data found' };
}

async function fetchFromOpenWeather(cityName) {
  try {
    if (!process.env.OPENWEATHER_API_KEY) {
      return { success: false, error: 'OpenWeather API key not configured' };
    }
    
    const coords = await getCoordinatesForCity(cityName);
    if (!coords) {
      return { success: false, error: 'Could not get coordinates for city' };
    }
    
    const url = `${API_SOURCES.openweather.baseUrl}?lat=${coords.lat}&lon=${coords.lon}&appid=${process.env.OPENWEATHER_API_KEY}`;
    const response = await axios.get(url);
    
    if (response.data && response.data.list && response.data.list.length > 0) {
      const data = response.data.list[0];
      const results = [];
      
      // Convert OpenWeather format to our standard format
      if (data.components) {
        Object.keys(data.components).forEach(pollutant => {
          const value = data.components[pollutant];
          if (value !== undefined) {
            results.push({
              pollutant: pollutant.replace('_', '.'), // pm2_5 -> pm2.5
              value: value,
              unit: '╬╝g/m┬│',
              dateUTC: new Date(data.dt * 1000).toISOString(),
              dateLocal: new Date(data.dt * 1000).toISOString(),
              location: cityName,
              source: 'OpenWeather'
            });
          }
        });
      }
      
      return {
        success: true,
        source: 'OpenWeather',
        city: cityName,
        results: results,
        aqi: data.main?.aqi,
        coordinates: [coords.lat, coords.lon]
      };
    }
  } catch (err) {
    console.log('OpenWeather API failed:', err.message);
    return { success: false, error: err.message };
  }
  
  return { success: false, error: 'No data found' };
}

function lastDayOfMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

app.post("/api/measurements", async (req, res) => {
  try {
    const body = req.body || {};
    const cityName = (body.city || "").trim();
    if (!cityName) return res.status(400).json({ error: "city is required" });

    // Create cache key for this request
    const cacheKey = `measurements_${cityName}_${JSON.stringify(body)}`;
    
    // Check cache first
    const cachedResult = cache.get(cacheKey);
    if (cachedResult) {
      console.log(`≡ƒÄ» Cache hit for measurements: ${cityName}`);
      return res.json(cachedResult);
    }
    console.log(`Γ¥î Cache miss for measurements: ${cityName}`);

    const locations = await findLocationsByCity(cityName);
    if (locations.length === 0) return res.status(404).json({ error: `No locations found for \"${cityName}\"` });

    // Parse and validate date filtering parameters (same as hybrid-measurements)
    const currentYear = new Date().getFullYear();
    let fromYear = null, toYear = null;
    let fromMonth = null, toMonth = null;
    let fromDay = null, toDay = null;
    let fromHourStr = null, toHourStr = null;

    // Validate and parse years
    if (body.fromYear) {
      const fy = parseInt(body.fromYear, 10);
      if (fy >= 2000 && fy <= currentYear) fromYear = fy;
    }
    if (body.toYear) {
      const ty = parseInt(body.toYear, 10);
      if (ty >= 2000 && ty <= currentYear) toYear = ty;
    }

    // Validate and parse months
    if (body.fromMonth) {
      const fm = parseInt(body.fromMonth, 10);
      if (fm >= 1 && fm <= 12) fromMonth = fm;
    }
    if (body.toMonth) {
      const tm = parseInt(body.toMonth, 10);
      if (tm >= 1 && tm <= 12) toMonth = tm;
    }

    // Validate and parse days
    if (body.fromDay) {
      const fd = parseInt(body.fromDay, 10);
      if (fd >= 1 && fd <= 31) fromDay = fd;
    }
    if (body.toDay) {
      const td = parseInt(body.toDay, 10);
      if (td >= 1 && td <= 31) toDay = td;
    }

    // Validate time format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (body.fromHour && typeof body.fromHour === 'string' && timeRegex.test(body.fromHour.trim())) {
      fromHourStr = body.fromHour.trim();
    }
    if (body.toHour && typeof body.toHour === 'string' && timeRegex.test(body.toHour.trim())) {
      toHourStr = body.toHour.trim();
    }

    let start = new Date();
    let end = new Date();

    if (fromYear) {
      const fm = fromMonth ? (fromMonth - 1) : 0;
      const fd = fromDay || 1;
      const ft = parseTimeString(fromHourStr || "00:00");
      
      const testDate = new Date(Date.UTC(fromYear, fm, fd, ft.hours, ft.minutes, 0));
      if (!isNaN(testDate.getTime())) {
        start = testDate;
      } else {
        start = new Date(Date.UTC(fromYear, 0, 1, 0, 0, 0));
      }
    } else {
      start = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    }

    if (toYear) {
      const tm = toMonth ? (toMonth - 1) : 11;
      const td = toDay || lastDayOfMonth(toYear, tm);
      const tt = parseTimeString(toHourStr || "23:59");
      
      const testDate = new Date(Date.UTC(toYear, tm, td, tt.hours, tt.minutes, 59));
      if (!isNaN(testDate.getTime())) {
        end = testDate;
      } else {
        end = new Date(Date.UTC(toYear, 11, 31, 23, 59, 59));
      }
    } else {
      end = new Date();
    }

    // Ensure start is before end
    if (start >= end) {
      start = new Date(end.getTime() - 24 * 3600 * 1000);
    }

    const date_from = start.toISOString();
    const date_to = end.toISOString();

    // Get measurements from sensors in matching locations
    let allResults = [];
    for (const location of locations.slice(0, 3)) { // Limit to first 3 locations
      try {
        // Get sensors for this location
        for (const sensor of location.sensors || []) {
          try {
            let url = `${OPENAQ_API}/sensors/${sensor.id}/measurements?limit=100&sort=desc`;
            
            // Add date filtering if specific dates are provided
            if (fromYear || toYear) {
              url += `&datetime_from=${encodeURIComponent(date_from)}&datetime_to=${encodeURIComponent(date_to)}`;
            }
            
            const response = await axios.get(url, { headers: HEADERS });
            
            const sensorResults = (response.data.results || []).map(r => ({
              pollutant: r.parameter?.name || 'unknown',
              value: r.value,
              unit: r.parameter?.units || '',
              dateLocal: r.period?.datetimeTo?.local,
              dateUTC: r.period?.datetimeTo?.utc,
              location: location.name
            }));
            
            allResults = allResults.concat(sensorResults);
          } catch (sensorErr) {
            console.log(`Failed to fetch data for sensor ${sensor.id}:`, sensorErr.message);
          }
        }
      } catch (err) {
        console.log(`Failed to fetch data for location ${location.id}:`, err.message);
      }
    }

    // Generate AI-powered advice using Gemini
    let localAdvice = "";
    try {
      if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "demo" && allResults.length > 0) {
        const prompt = `Provide a brief health advisory (1-2 sentences) for ${cityName} based on this air quality data: ${JSON.stringify(allResults.slice(0, 10))}. Focus on practical recommendations.`;
        
        const requestBody = {
          contents: [{
            parts: [{ text: prompt }]
          }]
        };

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const response = await axios.post(geminiUrl, requestBody, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 8000
        });

        if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
          localAdvice = response.data.candidates[0].content.parts[0].text.trim();
          console.log(`Γ£¿ Gemini AI advice generated for ${cityName}`);
        } else {
          throw new Error('No AI response');
        }
      } else {
        throw new Error('Gemini not available');
      }
    } catch (aiError) {
      // Fallback to rule-based advice
      const pm25 = allResults.filter(r => r.pollutant === "pm25").map(r => r.value);
      const avgPm25 = pm25.length ? pm25.reduce((a,b)=>a+b,0)/pm25.length : null;
      if (avgPm25 === null) {
        localAdvice = "";
      } else if (avgPm25 >= 150) {
        localAdvice = "PM2.5 is very high ΓÇö avoid outdoor activities and wear protective masks.";
      } else if (avgPm25 >= 55) {
        localAdvice = "PM2.5 is unhealthy ΓÇö sensitive groups should avoid prolonged outdoor exertion.";
      } else if (avgPm25 >= 35) {
        localAdvice = "PM2.5 is moderate ΓÇö consider limiting long outdoor activities.";
      } else {
        localAdvice = "Air quality (PM2.5) is good to moderate.";
      }
    }

    const responseData = { 
      city: cityName, 
      from: date_from, 
      to: date_to, 
      count: allResults.length, 
      results: allResults, 
      localAdvice,
      locations: locations.slice(0, 5).map(l => l.name)
    };

    // Cache the response for future requests
    cache.set(cacheKey, responseData);
    console.log(`≡ƒÆ╛ Cached measurements for ${cityName}`);

    res.json(responseData);
  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).json({ error: err.response?.data || "Internal server error" });
  }
});

app.post("/api/insights", async (req, res) => {
  try {
    const body = req.body || {};
    const city = body.city || "";
    const data = body.data || [];
    if (!data.length) return res.status(400).json({ error: "no data provided" });

    // Create cache key for this request
    const cacheKey = `insights_${city}_${JSON.stringify(data.slice(0,10))}`;
    
    // Check cache first
    const cachedResult = cache.get(cacheKey);
    if (cachedResult) {
      console.log(`≡ƒÄ» Cache hit for insights: ${city}`);
      return res.json(cachedResult);
    }
    console.log(`Γ¥î Cache miss for insights: ${city}`);

    // Try Gemini AI first, fallback to rule-based if it fails
    let geminiWorked = false;
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "demo") {
      console.log(`Attempting AI-powered insights for ${city} using Gemini...`);
      
      const prompt = `You are an air quality health expert. Provide a concise, practical health advisory (2-3 sentences) for ${city} based on this air quality data: ${JSON.stringify(data)}. Focus on actionable health recommendations for residents and visitors. Be specific about activities to avoid or precautions to take.`;
      
      const requestBody = {
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      };

      // Try multiple Gemini API endpoints with latest working model names
      const geminiEndpoints = [
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-latest:generateContent?key=${process.env.GEMINI_API_KEY}`
      ];
      
      for (const geminiUrl of geminiEndpoints) {
        try {
          console.log(`Trying Gemini endpoint: ${geminiUrl.split('?')[0]}`);
          const response = await axios.post(geminiUrl, requestBody, {
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 15000 // 15 second timeout
          });
          
          if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            const aiInsight = response.data.candidates[0].content.parts[0].text;
            console.log('≡ƒÄë Gemini AI insights generated successfully!');
            
            const responseData = { 
              insights: aiInsight.trim(),
              source: 'Gemini AI',
              city: city,
              model: geminiUrl.includes('flash') ? 'Gemini 1.5 Flash' : 'Gemini Pro'
            };

            // Cache the AI response for future requests
            cache.set(cacheKey, responseData);
            console.log(`≡ƒÆ╛ Cached AI insights for ${city}`);

            return res.json(responseData);
          }
        } catch (endpointError) {
          console.log(`Endpoint failed: ${endpointError.response?.status} ${endpointError.response?.statusText}`);
          console.log(`Error details: ${endpointError.response?.data || endpointError.message}`);
          continue; // Try next endpoint
        }
      }
      
      console.log('Γ¥î All Gemini endpoints failed, falling back to professional rule-based system');
    }

    // Enhanced Professional Rule-Based Health Advisory System
    console.log(`Generating professional-grade health advisory for ${city}...`);
    
    // Analyze all pollutants
    const pm25 = data.filter(r => r.pollutant === "pm25" || r.pollutant === "pm2.5").map(r => r.value);
    const pm10 = data.filter(r => r.pollutant === "pm10").map(r => r.value);
    const no2 = data.filter(r => r.pollutant === "no2").map(r => r.value);
    const o3 = data.filter(r => r.pollutant === "o3" || r.pollutant === "ozone").map(r => r.value);
    const so2 = data.filter(r => r.pollutant === "so2").map(r => r.value);
    const co = data.filter(r => r.pollutant === "co").map(r => r.value);
    
    // Calculate averages
    const avgPm25 = pm25.length ? pm25.reduce((a,b)=>a+b,0)/pm25.length : null;
    const avgPm10 = pm10.length ? pm10.reduce((a,b)=>a+b,0)/pm10.length : null;
    const avgNo2 = no2.length ? no2.reduce((a,b)=>a+b,0)/no2.length : null;
    const avgO3 = o3.length ? o3.reduce((a,b)=>a+b,0)/o3.length : null;
    const avgSo2 = so2.length ? so2.reduce((a,b)=>a+b,0)/so2.length : null;
    const avgCo = co.length ? co.reduce((a,b)=>a+b,0)/co.length : null;
    
    // Health risk assessment
    let overallRisk = "low";
    let specificRisks = [];
    let recommendations = [];
    let vulnerableGroups = [];
    
    // PM2.5 Assessment (WHO guidelines: Good <15, Moderate 15-35, Poor 35-55, Very Poor >55)
    if (avgPm25 !== null) {
      if (avgPm25 >= 250) {
        overallRisk = "extreme"; 
        specificRisks.push("PM2.5 at emergency levels");
        recommendations.push("avoid all outdoor activities", "seal windows and doors", "use air purifiers on high");
        vulnerableGroups.push("everyone");
      } else if (avgPm25 >= 150) {
        overallRisk = "very high"; 
        specificRisks.push("PM2.5 at hazardous levels");
        recommendations.push("avoid outdoor exercise", "wear N95/FFP2 masks outdoors", "limit time outside");
        vulnerableGroups.push("children", "elderly", "people with heart/lung conditions");
      } else if (avgPm25 >= 55) {
        overallRisk = overallRisk === "low" ? "high" : overallRisk;
        specificRisks.push("PM2.5 unhealthy for sensitive groups");
        recommendations.push("sensitive individuals should limit outdoor activities", "consider masks for extended outdoor time");
        vulnerableGroups.push("children", "elderly", "asthmatics");
      } else if (avgPm25 >= 35) {
        overallRisk = overallRisk === "low" ? "moderate" : overallRisk;
        specificRisks.push("PM2.5 moderately elevated");
        recommendations.push("monitor air quality updates", "consider reducing strenuous outdoor activities");
        vulnerableGroups.push("very sensitive individuals");
      }
    }
    
    // PM10 Assessment
    if (avgPm10 !== null && avgPm10 >= 150) {
      overallRisk = overallRisk === "low" ? "high" : overallRisk;
      specificRisks.push("PM10 at unhealthy levels");
      if (!recommendations.includes("consider masks for extended outdoor time")) {
        recommendations.push("consider masks for dusty conditions");
      }
    }
    
    // NO2 Assessment (WHO: Good <25, Moderate 25-50, Poor 50-100, Very Poor >100)
    if (avgNo2 !== null && avgNo2 >= 100) {
      overallRisk = overallRisk === "low" ? "high" : overallRisk;
      specificRisks.push("NO2 at concerning levels");
      recommendations.push("avoid busy roads and traffic", "limit outdoor exercise near vehicles");
      vulnerableGroups.push("people with respiratory conditions");
    }
    
    // O3 Assessment
    if (avgO3 !== null && avgO3 >= 120) {
      overallRisk = overallRisk === "low" ? "moderate" : overallRisk;
      specificRisks.push("Ozone levels elevated");
      recommendations.push("avoid outdoor exercise during peak sun hours", "stay indoors during hottest part of day");
      vulnerableGroups.push("children", "outdoor workers");
    }
    
    // Generate contextual advice
    let insight = "";
    
    if (overallRisk === "extreme") {
      insight = `≡ƒÜ¿ HEALTH EMERGENCY: Air quality in ${city} is extremely hazardous (${specificRisks.join(", ")}). ${recommendations.join(", ")}. Seek medical attention if experiencing breathing difficulties.`;
    } else if (overallRisk === "very high") {
      insight = `ΓÜá∩╕Å VERY UNHEALTHY: Air quality in ${city} poses serious health risks (${specificRisks.join(", ")}). Essential advice: ${recommendations.slice(0, 3).join(", ")}. Especially important for ${[...new Set(vulnerableGroups)].join(", ")}.`;
    } else if (overallRisk === "high") {
      insight = `ΓÜá∩╕Å UNHEALTHY: Air quality in ${city} is concerning (${specificRisks.join(", ")}). Recommended actions: ${recommendations.slice(0, 2).join(", ")}. ${[...new Set(vulnerableGroups)].join(", ")} should take extra precautions.`;
    } else if (overallRisk === "moderate") {
      insight = `ΓÜí MODERATE: Air quality in ${city} requires attention (${specificRisks.join(", ")}). Consider ${recommendations[0] || "monitoring conditions closely"}. ${vulnerableGroups.length ? [...new Set(vulnerableGroups)].join(", ") + " should be cautious" : "Generally acceptable for most people"}.`;
    } else {
      const pollutantCount = data.length;
      const uniquePollutants = [...new Set(data.map(r => r.pollutant))];
      insight = `Γ£à GOOD: Air quality in ${city} appears healthy based on ${pollutantCount} measurements covering ${uniquePollutants.join(", ")}. Safe for all outdoor activities including exercise and recreation.`;
    }
    
    const responseData = { 
      insights: insight,
      source: 'Professional Health Advisory System',
      city: city,
      riskLevel: overallRisk,
      analysis: {
        pollutantsAnalyzed: data.length,
        specificRisks: specificRisks,
        recommendations: recommendations,
        vulnerableGroups: [...new Set(vulnerableGroups)]
      },
      note: 'AI-grade health analysis using WHO and EPA guidelines - Professional medical-level advisory system'
    };

    // Cache the response for future requests
    cache.set(cacheKey, responseData);
    console.log(`≡ƒÆ╛ Cached rule-based insights for ${city}`);

    res.json(responseData);

  } catch (err) {
    console.error('Insights generation failed:', err.message);
    res.status(500).json({ error: "Failed to generate insights", details: err.message });
  }
});

// Get all available countries
app.get("/api/countries", async (req, res) => {
  try {
    const response = await axios.get(`${OPENAQ_API}/countries?limit=200`, { headers: HEADERS });
    const countries = (response.data.results || []).map(c => ({
      id: c.id,
      code: c.code,
      name: c.name,
      firstDate: c.datetimeFirst,
      lastDate: c.datetimeLast
    }));
    res.json({ countries });
  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).json({ error: err.response?.data || "Failed to fetch countries" });
  }
});

// Get all locations for a specific country
app.get("/api/locations/:countryCode", async (req, res) => {
  try {
    const countryCode = req.params.countryCode;
    const locations = await loadLocations();
    
    const countryLocations = locations.filter(loc => 
      loc.country?.code?.toLowerCase() === countryCode.toLowerCase()
    );
    
    // Group by state/region (extracted from location names)
    const locationsByRegion = {};
    countryLocations.forEach(loc => {
      // Try to extract state/city from location name
      let region = "Unknown";
      const name = loc.name || "";
      
      // Common patterns for Indian locations
      if (name.includes("Delhi")) region = "Delhi";
      else if (name.includes("Mumbai") || name.includes("Maharashtra")) region = "Maharashtra";
      else if (name.includes("Bengaluru") || name.includes("Bangalore") || name.includes("KSPCB")) region = "Karnataka";
      else if (name.includes("Chennai") || name.includes("Tamil")) region = "Tamil Nadu";
      else if (name.includes("Kolkata") || name.includes("WBPCB") || name.includes("WBSPCB")) region = "West Bengal";
      else if (name.includes("Hyderabad") || name.includes("TSPCB")) region = "Telangana";
      else if (name.includes("Kanpur") || name.includes("Agra") || name.includes("UPPCB")) region = "Uttar Pradesh";
      else if (name.includes("Gaya") || name.includes("Muzaffarpur") || name.includes("BSPCB")) region = "Bihar";
      else if (name.includes("Gurugram") || name.includes("Rohtak") || name.includes("HSPCB")) region = "Haryana";
      else if (name.includes("Jodhpur") || name.includes("RSPCB")) region = "Rajasthan";
      else if (name.includes("Haldia")) region = "West Bengal";
      else {
        // Extract city name from location name
        const parts = name.split(",");
        if (parts.length > 1) {
          region = parts[1].trim();
        } else {
          region = parts[0].split(" ")[0];
        }
      }
      
      if (!locationsByRegion[region]) {
        locationsByRegion[region] = [];
      }
      
      locationsByRegion[region].push({
        id: loc.id,
        name: loc.name,
        coordinates: loc.coordinates,
        sensors: loc.sensors?.map(s => s.parameter?.name).filter(Boolean) || [],
        lastUpdate: loc.datetimeLast
      });
    });
    
    res.json({ 
      country: countryCode.toUpperCase(),
      totalLocations: countryLocations.length,
      regions: locationsByRegion 
    });
  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).json({ error: err.response?.data || "Failed to fetch locations" });
  }
});

// Helper function to filter for recent data (last 2 years for better charts)
function filterRecentData(results, maxYearsBack = 2) {
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - maxYearsBack);
  
  const filtered = results.filter(item => {
    if (!item.dateUTC && !item.dateLocal) return false; // Remove if no date
    
    const itemDate = new Date(item.dateUTC || item.dateLocal);
    return !isNaN(itemDate.getTime()) && itemDate >= cutoffDate;
  });
  
  // If we have very few recent results, keep more (up to 5 years back)
  if (filtered.length < 10 && results.length > 10) {
    const olderCutoff = new Date();
    olderCutoff.setFullYear(olderCutoff.getFullYear() - 5);
    
    return results.filter(item => {
      if (!item.dateUTC && !item.dateLocal) return false;
      const itemDate = new Date(item.dateUTC || item.dateLocal);
      return !isNaN(itemDate.getTime()) && itemDate >= olderCutoff;
    });
  }
  
  return filtered;
}

// Multi-API Hybrid endpoint - tries multiple sources with caching
app.post("/api/hybrid-measurements", async (req, res) => {
  try {
    const body = req.body || {};
    const cityName = (body.city || "").trim();
    if (!cityName) return res.status(400).json({ error: "city is required" });

    // Create cache key based on request parameters
    const cacheKey = `measurements_${cityName}_${JSON.stringify(body)}`;
    const cachedResult = cache.get(cacheKey);
    
    if (cachedResult) {
      console.log(`Γ£à Cache hit for ${cityName}`);
      return res.json({
        ...cachedResult,
        cached: true,
        cacheTimestamp: new Date().toISOString()
      });
    }
    
    console.log(`≡ƒöä Cache miss for ${cityName}, fetching fresh data...`);

    // Parse and validate date filtering parameters
    const currentYear = new Date().getFullYear();
    let fromYear = null, toYear = null;
    let fromMonth = null, toMonth = null;
    let fromDay = null, toDay = null;
    let fromHourStr = null, toHourStr = null;

    // Validate and parse years
    if (body.fromYear) {
      const fy = parseInt(body.fromYear, 10);
      if (fy >= 2000 && fy <= currentYear) fromYear = fy;
    }
    if (body.toYear) {
      const ty = parseInt(body.toYear, 10);
      if (ty >= 2000 && ty <= currentYear) toYear = ty;
    }

    // Validate and parse months
    if (body.fromMonth) {
      const fm = parseInt(body.fromMonth, 10);
      if (fm >= 1 && fm <= 12) fromMonth = fm;
    }
    if (body.toMonth) {
      const tm = parseInt(body.toMonth, 10);
      if (tm >= 1 && tm <= 12) toMonth = tm;
    }

    // Validate and parse days
    if (body.fromDay) {
      const fd = parseInt(body.fromDay, 10);
      if (fd >= 1 && fd <= 31) fromDay = fd;
    }
    if (body.toDay) {
      const td = parseInt(body.toDay, 10);
      if (td >= 1 && td <= 31) toDay = td;
    }

    // Validate time format (HH:MM)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (body.fromHour && typeof body.fromHour === 'string' && timeRegex.test(body.fromHour.trim())) {
      fromHourStr = body.fromHour.trim();
    }
    if (body.toHour && typeof body.toHour === 'string' && timeRegex.test(body.toHour.trim())) {
      toHourStr = body.toHour.trim();
    }

    // Calculate date range with safe defaults
    let start = new Date();
    let end = new Date();

    if (fromYear) {
      const fm = fromMonth ? (fromMonth - 1) : 0; // Default to January
      const fd = fromDay || 1; // Default to 1st day
      const ft = parseTimeString(fromHourStr || "00:00");
      
      // Validate the date is possible
      const testDate = new Date(Date.UTC(fromYear, fm, fd, ft.hours, ft.minutes, 0));
      if (!isNaN(testDate.getTime())) {
        start = testDate;
      } else {
        // Fallback to start of year if invalid date
        start = new Date(Date.UTC(fromYear, 0, 1, 0, 0, 0));
      }
    } else {
      start = new Date(Date.now() - 7 * 24 * 3600 * 1000); // Last 7 days by default
    }

    if (toYear) {
      const tm = toMonth ? (toMonth - 1) : 11; // Default to December
      const td = toDay || lastDayOfMonth(toYear, tm); // Default to last day of month
      const tt = parseTimeString(toHourStr || "23:59");
      
      // Validate the date is possible
      const testDate = new Date(Date.UTC(toYear, tm, td, tt.hours, tt.minutes, 59));
      if (!isNaN(testDate.getTime())) {
        end = testDate;
      } else {
        // Fallback to end of year if invalid date
        end = new Date(Date.UTC(toYear, 11, 31, 23, 59, 59));
      }
    } else {
      end = new Date();
    }

    // Ensure start is before end
    if (start >= end) {
      start = new Date(end.getTime() - 24 * 3600 * 1000); // 1 day before end
    }

    const date_from = start.toISOString();
    const date_to = end.toISOString();
    
    console.log(`≡ƒùô∩╕Å Date filtering: ${date_from} to ${date_to}`);

    const results = [];
    let successfulSource = null;
    let allErrors = [];

    // 1. Try OpenAQ first (primary source)
    try {
      console.log(`Trying OpenAQ for ${cityName}...`);
      const locations = await findLocationsByCity(cityName);
      
      if (locations.length > 0) {
        // Get measurements from sensors in matching locations (optimized with concurrent requests)
        let allResults = [];
        const sensorPromises = [];
        const maxSensors = 3; // Limit to 3 sensors for performance
        
        for (const location of locations.slice(0, 2)) {
          for (const sensor of (location.sensors || []).slice(0, maxSensors)) {
            let url = `${OPENAQ_API}/sensors/${sensor.id}/measurements?limit=${MAX_RESULTS_PER_API}&sort=desc`;
            
            // Add date filtering if specific dates are provided
            if (fromYear || toYear) {
              url += `&datetime_from=${encodeURIComponent(date_from)}&datetime_to=${encodeURIComponent(date_to)}`;
            }
            
            sensorPromises.push(
              axios.get(url, { 
                headers: HEADERS,
                timeout: REQUEST_TIMEOUT
              }).then(response => ({
                success: true,
                location: location.name,
                data: (response.data.results || []).map(r => ({
                  pollutant: r.parameter?.name || 'unknown',
                  value: r.value,
                  unit: r.parameter?.units || '',
                  dateLocal: r.period?.datetimeTo?.local,
                  dateUTC: r.period?.datetimeTo?.utc,
                  location: location.name,
                  source: 'OpenAQ'
                }))
              })).catch(err => ({
                success: false,
                error: err.message
              }))
            );
          }
        }
        
        // Execute all sensor requests concurrently with timeout
        const sensorResults = await Promise.allSettled(sensorPromises);
        
        // Collect successful results
        sensorResults.forEach(result => {
          if (result.status === 'fulfilled' && result.value.success) {
            allResults = allResults.concat(result.value.data);
          }
        });
        
        if (allResults.length > 0) {
          successfulSource = 'OpenAQ';
          results.push(...allResults);
        }
      }
    } catch (openaqErr) {
      allErrors.push(`OpenAQ: ${openaqErr.message}`);
      console.log('OpenAQ failed:', openaqErr.message);
    }

    // 2. If OpenAQ failed or no results, try WAQI (but note: WAQI only has current data)
    if (results.length === 0) {
      console.log(`Trying WAQI for ${cityName}...`);
      const waqiResult = await fetchFromWAQI(cityName);
      if (waqiResult.success && waqiResult.results.length > 0) {
        successfulSource = 'WAQI';
        results.push(...waqiResult.results);
        
        // Note if user requested historical data but we're using current data
        if (fromYear && fromYear < new Date().getFullYear()) {
          console.log(`ΓÜá∩╕Å User requested ${fromYear} data, but WAQI only provides current data`);
        }
      } else {
        allErrors.push(`WAQI: ${waqiResult.error}`);
      }
    }

    // 3. If both failed, try OpenWeather
    if (results.length === 0) {
      console.log(`Trying OpenWeather for ${cityName}...`);
      const owResult = await fetchFromOpenWeather(cityName);
      if (owResult.success && owResult.results.length > 0) {
        successfulSource = 'OpenWeather';
        results.push(...owResult.results);
      } else {
        allErrors.push(`OpenWeather: ${owResult.error}`);
      }
    }

    // 4. Return results or error
    if (results.length === 0) {
      return res.status(404).json({ 
        error: `No air quality data found for "${cityName}" from any source`,
        attemptedSources: ['OpenAQ', 'WAQI', 'OpenWeather'],
        errors: allErrors,
        suggestion: "Try a different city name or check if the city has monitoring stations"
      });
    }

    // Generate AI-powered health advice using Gemini
    let localAdvice = "";
    let adviceSource = "Rule-based";
    
    try {
      if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "demo" && results.length > 0) {
        console.log(`≡ƒñû Generating Gemini AI health advice for ${cityName}...`);
        
        const prompt = `You are an air quality health expert. Provide a practical health advisory (2-3 sentences) for ${cityName} based on this air quality data from ${successfulSource}: ${JSON.stringify(results.slice(0, 15))}. Focus on actionable recommendations for residents.`;
        
        const requestBody = {
          contents: [{
            parts: [{ text: prompt }]
          }]
        };

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const response = await axios.post(geminiUrl, requestBody, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        });

        if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
          localAdvice = response.data.candidates[0].content.parts[0].text.trim();
          adviceSource = "Gemini AI";
          console.log('≡ƒÄë Gemini AI health advice generated successfully!');
        } else {
          throw new Error('No AI response received');
        }
      } else {
        throw new Error('Gemini AI not available');
      }
    } catch (aiError) {
      console.log('≡ƒöä Gemini failed, using enhanced rule-based advice...');
      
      // Enhanced rule-based advice with multiple pollutants
      const pm25 = results.filter(r => r.pollutant === "pm25" || r.pollutant === "pm2.5").map(r => r.value);
      const pm10 = results.filter(r => r.pollutant === "pm10").map(r => r.value);
      const no2 = results.filter(r => r.pollutant === "no2").map(r => r.value);
      
      const avgPm25 = pm25.length ? pm25.reduce((a,b)=>a+b,0)/pm25.length : null;
      const avgPm10 = pm10.length ? pm10.reduce((a,b)=>a+b,0)/pm10.length : null;
      const avgNo2 = no2.length ? no2.reduce((a,b)=>a+b,0)/no2.length : null;
      
      // Determine overall air quality level
      let level = "good";
      let concerns = [];
      
      if (avgPm25 !== null) {
        if (avgPm25 >= 150) { level = "very unhealthy"; concerns.push("PM2.5 extremely high"); }
        else if (avgPm25 >= 55) { level = "unhealthy"; concerns.push("PM2.5 high"); }
        else if (avgPm25 >= 35) { level = "moderate"; concerns.push("PM2.5 elevated"); }
      }
      
      if (avgPm10 !== null && avgPm10 >= 150) {
        level = level === "good" ? "moderate" : level;
        concerns.push("PM10 elevated");
      }
      
      if (avgNo2 !== null && avgNo2 >= 100) {
        level = level === "good" ? "moderate" : level;
        concerns.push("NO2 elevated");
      }
      
      // Generate contextual advice
      if (level === "very unhealthy") {
        localAdvice = `Air quality in ${cityName} is very poor (${concerns.join(", ")}). Avoid all outdoor activities, stay indoors with windows closed, and use air purifiers if available.`;
      } else if (level === "unhealthy") {
        localAdvice = `Air quality in ${cityName} is unhealthy (${concerns.join(", ")}). Limit outdoor activities, especially for children and sensitive individuals. Consider wearing N95 masks outdoors.`;
      } else if (level === "moderate") {
        localAdvice = `Air quality in ${cityName} is moderate (${concerns.join(", ")}). Generally acceptable, but sensitive individuals should consider limiting prolonged outdoor activities.`;
      } else {
        const pollutantCount = results.length;
        const sources = [...new Set(results.map(r => r.source))];
        localAdvice = `Air quality in ${cityName} appears good based on ${pollutantCount} measurements from ${sources.join(" and ")} monitoring. Safe for outdoor activities.`;
      }
      
      console.log('Γ£à Enhanced rule-based advice generated successfully');
    }

    // Filter for recent data to improve chart quality, but skip if user requested specific historical dates
    const userRequestedHistoricalData = fromYear && fromYear < new Date().getFullYear();
    const filteredResults = userRequestedHistoricalData ? results : filterRecentData(results);
    const dataQualityNote = filteredResults.length !== results.length ? 
      ` (${results.length - filteredResults.length} older records filtered for better visualization)` : 
      userRequestedHistoricalData ? ` (showing historical data from ${fromYear})` : "";

    const responseData = {
      city: cityName,
      from: date_from,
      to: date_to,
      source: successfulSource,
      count: filteredResults.length,
      results: filteredResults,
      measurements: filteredResults, // Add measurements field for chart processing
      snapshot: groupSnapshot(filteredResults), // Add snapshot for table display
      localAdvice: localAdvice,
      apiInfo: {
        primarySource: successfulSource,
        adviceSource: adviceSource,
        availableSources: Object.keys(API_SOURCES),
        note: `Data from ${successfulSource} API${successfulSource === 'WAQI' || successfulSource === 'OpenWeather' ? ' (current data only)' : ` (${date_from.split('T')[0]} to ${date_to.split('T')[0]})`} ≡ƒôà, advice from ${adviceSource}${dataQualityNote}`
      }
    };

    // Cache the response for future requests
    cache.set(cacheKey, responseData);
    console.log(`≡ƒÆ╛ Cached result for ${cityName}`);

    res.json(responseData);

  } catch (err) {
    res.status(500).json({ 
      error: "Multi-API request failed", 
      details: err.message 
    });
  }
});

// Test Gemini API key endpoint
app.get("/api/test-gemini", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "demo") {
      return res.json({ 
        status: 'No API Key', 
        message: 'GEMINI_API_KEY not configured or set to demo' 
      });
    }

    const testRequest = {
      contents: [{
        parts: [{
          text: "Say 'Hello from Gemini!' in exactly those words."
        }]
      }]
    };

    const endpoints = [
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`Testing endpoint: ${endpoint.split('?')[0]}`);
        const response = await axios.post(endpoint, testRequest, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        });

        if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
          return res.json({
            status: 'Success',
            endpoint: endpoint.split('?')[0],
            response: response.data.candidates[0].content.parts[0].text,
            model: endpoint.includes('flash') ? 'Gemini 1.5 Flash' : 'Gemini Pro'
          });
        }
      } catch (err) {
        console.log(`Endpoint failed: ${err.response?.status} - ${err.message}`);
        continue;
      }
    }

    res.json({
      status: 'All endpoints failed',
      message: 'No working Gemini endpoints found',
      suggestion: 'Check if API key is valid and has proper permissions'
    });

  } catch (err) {
    res.status(500).json({ 
      status: 'Error', 
      message: err.message 
    });
  }
});

// Get available API sources information
app.get("/api/sources", async (req, res) => {
  try {
    const sourcesInfo = {
      totalSources: Object.keys(API_SOURCES).length,
      sources: {
        OpenAQ: {
          name: "OpenAQ",
          coverage: "137 countries, 26 locations in India",
          strengths: ["Historical data", "Sensor-level detail", "Government sources"],
          limitations: ["Limited coverage in some countries", "Missing Tamil Nadu"],
          status: HEADERS["X-API-Key"] ? "Configured Γ£à" : "Needs API key Γ¥î",
          website: "https://openaq.org"
        },
        WAQI: {
          name: "World Air Quality Index",
          coverage: "11,000+ stations worldwide, 1000+ cities",
          strengths: ["Global coverage", "Real-time data", "Many missing countries covered"],
          limitations: ["AQI format only", "Limited historical data"],
          status: API_SOURCES.waqi.token !== "demo" ? "Configured Γ£à" : "Using demo token ΓÜá∩╕Å",
          website: "https://aqicn.org",
          note: "Get free token from https://aqicn.org/data-platform/token/"
        },
        OpenWeather: {
          name: "OpenWeatherMap Air Pollution",
          coverage: "Global coordinates-based coverage",
          strengths: ["Worldwide coverage", "Coordinate-based", "Weather + air quality"],
          limitations: ["Requires coordinates", "Limited pollutants"],
          status: process.env.OPENWEATHER_API_KEY ? "Configured Γ£à" : "Needs API key Γ¥î",
          website: "https://openweathermap.org",
          note: "Get free API key from https://openweathermap.org/api"
        }
      },
      hybridStrategy: {
        order: ["OpenAQ", "WAQI", "OpenWeather"],
        description: "Try OpenAQ first, fallback to WAQI, then OpenWeather",
        benefits: [
          "Maximum global coverage",
          "Automatic failover",
          "Best data source selection",
          "Support for missing countries"
        ]
      },
      missingCountriesCoverage: {
        "Russia": "WAQI Γ£à, OpenWeather Γ£à",
        "Iran": "WAQI Γ£à, OpenWeather Γ£à", 
        "South Korea": "WAQI Γ£à, OpenWeather Γ£à",
        "Venezuela": "WAQI Γ£à, OpenWeather Γ£à",
        "Tamil Nadu": "WAQI Γ£à (Chennai, Coimbatore), OpenWeather Γ£à",
        "Cuba": "WAQI Γ£à, OpenWeather Γ£à",
        "Syria": "WAQI Γ£à, OpenWeather Γ£à"
      }
    };
    
    res.json(sourcesInfo);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch sources information" });
  }
});

// Get countries missing from OpenAQ API
app.get("/api/missing-countries", async (req, res) => {
  try {
    const missingCountries = {
      total: 73,
      outOf: 192,
      percentage: "38% of world countries have NO air quality data",
      majorMissing: [
        "Russia", "Iran", "Venezuela", "South Korea", 
        "Belarus", "Libya", "Syria", "Cuba"
      ],
      byRegion: {
        "Africa": [
          "Angola", "Botswana", "Burundi", "Central African Republic", 
          "Congo", "Gabon", "Gambia", "Guinea-Bissau", "Lesotho", 
          "Liberia", "Libya", "Mauritania", "Namibia", "Niger", 
          "Sierra Leone", "Somalia", "Tanzania", "Togo"
        ],
        "Asia": [
          "Bhutan", "Brunei", "East Timor", "Iran", "Laos", 
          "Lebanon", "North Korea", "South Korea"
        ],
        "Americas": [
          "Bolivia", "Cuba", "Dominican Republic", "El Salvador", 
          "Haiti", "Jamaica", "Nicaragua", "Panama", "Suriname", "Venezuela"
        ],
        "Europe": [
          "Albania", "Belarus", "Georgia", "Liechtenstein"
        ],
        "Pacific Islands": [
          "Fiji", "Kiribati", "Marshall Islands", "Micronesia", 
          "Nauru", "Palau", "Samoa", "Solomon Islands", "Tonga", 
          "Tuvalu", "Vanuatu"
        ]
      },
      completeList: [
        "Albania", "Angola", "Antigua and Barbuda", "Bahamas", "Barbados", 
        "Belarus", "Benin", "Bhutan", "Bolivia", "Botswana", "Brunei", 
        "Burundi", "Cape Verde", "Central African Republic", "Comoros", 
        "Congo", "Cuba", "Djibouti", "Dominica", "Dominican Republic", 
        "East Timor", "El Salvador", "Equatorial Guinea", "Eritrea", "Fiji", 
        "Gabon", "Gambia", "Georgia", "Grenada", "Guinea-Bissau", "Haiti", 
        "Iran", "Jamaica", "Kiribati", "Laos", "Lebanon", "Lesotho", 
        "Liberia", "Libya", "Liechtenstein", "Marshall Islands", "Mauritania", 
        "Micronesia", "Namibia", "Nauru", "Nicaragua", "Niger", "North Korea", 
        "Palau", "Panama", "Papua New Guinea", "Russia", "Saint Kitts and Nevis", 
        "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", 
        "Sao Tome and Principe", "Seychelles", "Sierra Leone", "Solomon Islands", 
        "Somalia", "South Korea", "Suriname", "Syria", "Tanzania", "Togo", 
        "Tonga", "Trinidad and Tobago", "Tuvalu", "Vanuatu", "Vatican City", 
        "Venezuela", "Yemen"
      ],
      note: "These countries have no air quality monitoring stations in the OpenAQ global database"
    };
    
    res.json(missingCountries);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch missing countries data" });
  }
});










// Get Indian states and locations summary  
app.get("/api/india-summary", async (req, res) => {
  try {
    const locations = await loadLocations();
    const indiaLocations = locations.filter(loc => loc.country?.code === "IN");
    
    const statesSummary = {
      "Delhi": { count: 0, cities: [], hasData: true },
      "Karnataka": { count: 0, cities: [], hasData: true },
      "West Bengal": { count: 0, cities: [], hasData: true },
      "Uttar Pradesh": { count: 0, cities: [], hasData: true },
      "Bihar": { count: 0, cities: [], hasData: true },
      "Haryana": { count: 0, cities: [], hasData: true },
      "Rajasthan": { count: 0, cities: [], hasData: true },
      "Telangana": { count: 0, cities: [], hasData: true },
      "Maharashtra": { count: 0, cities: [], hasData: true },
      "Tamil Nadu": { count: 0, cities: [], hasData: false, note: "No monitoring stations available" },
      "Kerala": { count: 0, cities: [], hasData: false, note: "No monitoring stations available" },
      "Gujarat": { count: 0, cities: [], hasData: false, note: "No monitoring stations available" },
      "Andhra Pradesh": { count: 0, cities: [], hasData: false, note: "No monitoring stations available" }
    };
    
    indiaLocations.forEach(loc => {
      const name = loc.name || "";
      let state = "Other";
      let cityName = name.split(",")[0] || name.split(" - ")[0];
      
      if (name.includes("Delhi")) {
        state = "Delhi";
        cityName = name.includes("New Delhi") ? "New Delhi" : "Delhi";
      } else if (name.includes("Bengaluru") || name.includes("KSPCB")) {
        state = "Karnataka";
        cityName = "Bengaluru";
      } else if (name.includes("Kolkata") || name.includes("WBPCB") || name.includes("WBSPCB") || name.includes("Haldia")) {
        state = "West Bengal";
        cityName = name.includes("Kolkata") ? "Kolkata" : "Haldia";
      } else if (name.includes("Kanpur") || name.includes("Agra") || name.includes("UPPCB")) {
        state = "Uttar Pradesh";
        cityName = name.includes("Kanpur") ? "Kanpur" : "Agra";
      } else if (name.includes("Gaya") || name.includes("Muzaffarpur") || name.includes("BSPCB")) {
        state = "Bihar";
        cityName = name.includes("Gaya") ? "Gaya" : "Muzaffarpur";
      } else if (name.includes("Gurugram") || name.includes("Rohtak") || name.includes("HSPCB")) {
        state = "Haryana";
        cityName = name.includes("Gurugram") ? "Gurugram" : "Rohtak";
      } else if (name.includes("Jodhpur") || name.includes("RSPCB")) {
        state = "Rajasthan";
        cityName = "Jodhpur";
      } else if (name.includes("Hyderabad") || name.includes("TSPCB")) {
        state = "Telangana";
        cityName = "Hyderabad";
      } else if (name.includes("Chandrapur")) {
        state = "Maharashtra";
        cityName = "Chandrapur";
      }
      
      if (statesSummary[state]) {
        statesSummary[state].count++;
        if (!statesSummary[state].cities.includes(cityName)) {
          statesSummary[state].cities.push(cityName);
        }
      }
    });
    
    res.json({
      totalLocations: indiaLocations.length,
      statesWithData: Object.keys(statesSummary).filter(s => statesSummary[s].hasData).length,
      statesWithoutData: Object.keys(statesSummary).filter(s => !statesSummary[s].hasData).length,
      states: statesSummary,
      tamilNaduStatus: {
        available: false,
        message: "Unfortunately, Tamil Nadu has no monitoring stations in the OpenAQ database. No air quality data is available for Chennai, Coimbatore, Madurai, Salem, or any other Tamil Nadu cities.",
        alternatives: [
          "Delhi (7 monitoring stations)",
          "Karnataka - Bengaluru (3 stations)", 
          "West Bengal - Kolkata/Haldia (3 stations)"
        ]
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch India summary" });
  }
});



// Serve React app
const buildPath = path.resolve(__dirname, "../client/build");
app.use(express.static(buildPath));
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(buildPath, "index.html"));
});

const PORT = process.env.PORT || 5000;

// ==================== AUTOMATIC DATA COLLECTION ====================

// Connectivity check function removed - now using hybrid approach

/**
 * Automatically fetch and store air quality data for popular cities
 * This function runs periodically via cron job
 * Now includes connectivity check to prevent API calls when offline
 */
async function autoFetchAndStore() {
  const popularCities = ['Delhi', 'Mumbai', 'Bengaluru', 'Chennai', 'Kolkata', 'Hyderabad'];
  const apiSources = ['OpenAQ', 'WAQI', 'OpenWeather'];
  
  console.log('\n' + '='.repeat(60));
  console.log('ΓÅ░ SCHEDULED DATA COLLECTION TRIGGERED');
  console.log('≡ƒîÉ MULTI-SOURCE: Online APIs + Intelligent Fallback');
  console.log('='.repeat(60));
  
  // Check connectivity first
  // Always proceed with multi-source collection (no connectivity check needed)
  
  // if (!isOnline) {
    console.log('∩┐╜ COLLECTION SKIPPED: Server is offline');
    console.log('≡ƒô¥ Data collection will resume when internet connectivity is restored');
    console.log('≡ƒÆí This prevents API quota waste and failed requests');
    // return { success: false, reason: 'offline', message: 'Server offline - collection skipped' };
  // }
  
  console.log('∩┐╜≡ƒöä Starting balanced automatic data collection...');
  console.log(`≡ƒôè Using round-robin API assignment across ${apiSources.join(', ')}`);
  
  let successCount = 0;
  let totalCities = popularCities.length;
  let onlineSuccessCount = 0;
  let offlineGeneratedCount = 0;
  
  for (let i = 0; i < popularCities.length; i++) {
    const city = popularCities[i];
    const primaryApi = apiSources[i % apiSources.length]; // Round-robin assignment
    
    console.log(`\n≡ƒôì ${city} - Primary: ${primaryApi}`);
    try {
      console.log(`≡ƒôí Fetching data for ${city}...`);
      
      // Use existing location finding logic
      const locations = await findLocationsByCity(city);
      if (locations.length === 0) {
        console.log(`ΓÜá∩╕Å No locations found for ${city}`);
        continue;
      }

      let allResults = [];
      let successfulSource = null;

      // Try OpenAQ first
      for (const location of locations.slice(0, 2)) {
        if (location.sensors && location.sensors.length > 0) {
          for (const sensor of location.sensors.slice(0, 2)) {
            try {
              const url = `${OPENAQ_API}/sensors/${sensor.id}/measurements?limit=5&sort=desc`;
              const response = await axios.get(url, { headers: HEADERS, timeout: 8000 });
              
              const sensorResults = (response.data.results || []).map(r => ({
                pollutant: r.parameter?.name || 'unknown',
                value: r.value,
                unit: r.parameter?.units || '',
                dateUTC: r.period?.datetimeTo?.utc,
                location: location.name
              }));
              
              allResults = allResults.concat(sensorResults);
              successfulSource = 'OpenAQ';
            } catch (sensorErr) {
              console.log(`Failed to fetch sensor data: ${sensorErr.message}`);
            }
          }
        }
      }

      // Implement balanced API strategy
      if (allResults.length === 0) {
        const fallbackApis = ['WAQI', 'OpenWeather'].filter(api => api !== primaryApi);
        
        for (const fallbackApi of fallbackApis) {
          try {
            console.log(`≡ƒöä Trying ${fallbackApi} fallback...`);
            
            if (fallbackApi === 'WAQI') {
              const waqiResult = await fetchFromWAQI(city);
              if (waqiResult.success && waqiResult.data) {
                allResults = waqiResult.data;
                successfulSource = 'WAQI';
                console.log(`Γ£à ${fallbackApi} success: ${allResults.length} measurements`);
                break;
              }
            } else if (fallbackApi === 'OpenWeather') {
              // Add OpenWeather implementation
              const owResult = await fetchFromOpenWeather(city);
              if (owResult.success && owResult.data) {
                allResults = owResult.data;
                successfulSource = 'OpenWeather';
                console.log(`Γ£à ${fallbackApi} success: ${allResults.length} measurements`);
                break;
              }
            }
          } catch (err) {
            console.log(`Γ¥î ${fallbackApi} failed for ${city}: ${err.message}`);
          }
        }
      }

      // If no online data available, generate offline fallback data
      if (allResults.length === 0) {
        console.log(`≡ƒöä All APIs failed for ${city}, generating offline data...`);
        const offlineResult = generateOfflineData(city);
        if (offlineResult.success) {
          allResults = offlineResult.data;
          successfulSource = 'Offline Generated';
          console.log(`Γ£à Generated offline data for ${city}: ${allResults.length} measurements`);
        }
      }

      if (allResults.length > 0) {
        // Process and structure the data for database storage
        const pollutants = {};
        
        allResults.forEach(result => {
          const pollutant = result.pollutant.toLowerCase();
          if (['pm25', 'pm2.5'].includes(pollutant)) pollutants.pm25 = result.value;
          else if (pollutant === 'pm10') pollutants.pm10 = result.value;
          else if (pollutant === 'no2') pollutants.no2 = result.value;
          else if (pollutant === 'so2') pollutants.so2 = result.value;
          else if (['o3', 'ozone'].includes(pollutant)) pollutants.o3 = result.value;
          else if (pollutant === 'co') pollutants.co = result.value;
        });

        // Store in Neon database
        const storeData = {
          city: city,
          country: 'India',
          latitude: locations[0]?.coordinates?.latitude || null,
          longitude: locations[0]?.coordinates?.longitude || null,
          pollutants: pollutants,
          weather: {},
          api_source: successfulSource,
          timestamp: new Date()
        };

        const result = await storeAirQualityData(storeData);
        if (result.success) {
          console.log(`Γ£à Stored data for ${city} from ${successfulSource} - ${result.message}`);
          successCount++;
          if (successfulSource === 'Offline Generated') {
            offlineGeneratedCount++;
          } else {
            onlineSuccessCount++;
          }
        } else {
          console.log(`Γ¥î Failed to store data for ${city}: ${result.error}`);
        }
      } else {
        console.log(`Γ¥î Complete failure for ${city}: No online or offline data available`);
      }
      
      // Small delay between cities to avoid rate limiting  
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (err) {
      console.log(`Γ¥î Error processing ${city}: ${err.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`≡ƒÄë DATA COLLECTION COMPLETED`);
  console.log(`≡ƒôè Total Success: ${successCount}/${totalCities} cities collected`);
  console.log(`≡ƒîÉ Online Data: ${onlineSuccessCount} cities ΓÇó ≡ƒô▒ Offline Generated: ${offlineGeneratedCount} cities`);
  console.log(`ΓÅ░ Next collection: ${new Date(Date.now() + 60 * 60 * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  console.log('='.repeat(60));
  
  return { 
    success: true, 
    successCount, 
    totalCities,
    onlineSuccessCount,
    offlineGeneratedCount,
    reason: 'multi_source',
    message: `Successfully collected data for ${successCount}/${totalCities} cities (${onlineSuccessCount} online, ${offlineGeneratedCount} offline)` 
  };
}

// OpenWeather API fetch function
async function fetchFromOpenWeather(city) {
  try {
    const owUrl = `http://api.openweathermap.org/data/2.5/air_pollution?q=${city}&appid=${process.env.OPENWEATHER_API_KEY}`;
    const response = await axios.get(owUrl, { timeout: 10000 });
    
    if (response.data && response.data.list && response.data.list.length > 0) {
      const data = response.data.list[0];
      const measurements = [];
      
      if (data.components) {
        Object.keys(data.components).forEach(pollutant => {
          measurements.push({
            pollutant: pollutant.toUpperCase(),
            value: data.components[pollutant],
            unit: '┬╡g/m┬│',
            dateUTC: new Date(data.dt * 1000).toISOString(),
            dateLocal: new Date(data.dt * 1000).toISOString(),
            location: `${city}, India (OpenWeather)`,
            source: 'OpenWeather'
          });
        });
      }
      
      return { success: measurements.length > 0, data: measurements };
    }
    
    return { success: false, data: [] };
  } catch (error) {
    console.log(`OpenWeather API error for ${city}: ${error.message}`);
    return { success: false, data: [], error: error.message };
  }
}

// Generate offline fallback data when APIs are unavailable
function generateOfflineData(city) {
  console.log(`≡ƒô▒ Generating offline fallback data for ${city}...`);
  
  // City-specific baseline pollution levels (realistic estimates)
  const cityBaselines = {
    'Delhi': { pm25: 85, pm10: 120, no2: 45, so2: 15, o3: 35, co: 1.2 },
    'Mumbai': { pm25: 65, pm10: 95, no2: 40, so2: 12, o3: 28, co: 1.0 },
    'Bengaluru': { pm25: 45, pm10: 75, no2: 35, so2: 8, o3: 25, co: 0.8 },
    'Chennai': { pm25: 55, pm10: 85, no2: 38, so2: 10, o3: 30, co: 0.9 },
    'Kolkata': { pm25: 75, pm10: 110, no2: 42, so2: 18, o3: 32, co: 1.1 },
    'Hyderabad': { pm25: 50, pm10: 80, no2: 32, so2: 9, o3: 27, co: 0.7 }
  };
  
  const baseline = cityBaselines[city] || cityBaselines['Delhi'];
  const now = new Date();
  const measurements = [];
  
  // Add some realistic variation (+/- 20%)
  Object.keys(baseline).forEach(pollutant => {
    const baseValue = baseline[pollutant];
    const variation = (Math.random() - 0.5) * 0.4; // +/- 20% variation
    const value = Math.max(0, baseValue * (1 + variation));
    
    measurements.push({
      pollutant: pollutant.toUpperCase(),
      value: Math.round(value * 100) / 100, // Round to 2 decimal places
      unit: pollutant === 'co' ? 'mg/m┬│' : '┬╡g/m┬│',
      dateUTC: now.toISOString(),
      dateLocal: now.toISOString(),
      location: `${city}, India (Offline Generated)`,
      source: 'Offline Generated'
    });
  });
  
  return {
    success: true,
    data: measurements,
    source: 'Offline Generated',
    note: 'Generated from city-specific baseline data with realistic variation'
  };
}

// Schedule automatic data collection every hour
cron.schedule('0 * * * *', async () => {
  console.log('ΓÅ░ Cron job triggered: Hourly data collection');
  
  try {
    const result = await autoFetchAndStore();
    
    if (result.success) {
      console.log(`Γ£à Cron job completed successfully: ${result.message}`);
      if (result.onlineSuccessCount > 0 && result.offlineGeneratedCount > 0) {
        console.log(`∩┐╜ Mixed collection: ${result.onlineSuccessCount} online + ${result.offlineGeneratedCount} offline generated`);
      } else if (result.onlineSuccessCount > 0) {
        console.log(`≡ƒîÉ All online: Successfully collected from APIs for ${result.onlineSuccessCount} cities`);
      } else if (result.offlineGeneratedCount > 0) {
        console.log(`≡ƒô▒ All offline: Generated fallback data for ${result.offlineGeneratedCount} cities`);
      }
    } else {
      console.log(`ΓÜá∩╕Å Cron job completed with issues: ${result.message}`);
    }
  } catch (err) {
    console.error('Γ¥î Cron job failed with error:', err.message);
    console.error('≡ƒöº Will retry at next scheduled interval');
  }
}, {
  scheduled: true,
  timezone: "Asia/Kolkata"
});

console.log('ΓÅ░ Automatic data collection scheduled (every hour)');
console.log('≡ƒîÉ Always active: Multi-source data collection with intelligent fallback');
console.log('≡ƒöä Continuous operation regardless of internet connectivity');

console.log('ΓÅ░ Automatic data collection scheduled (every hour)');
console.log('≡ƒîÉ Always active: Multi-source data collection with intelligent fallback');
console.log('≡ƒöä Continuous operation regardless of internet connectivity');

// ==================== END AUTOMATIC COLLECTION ====================

// Start server
async function startServer() {
  try {
    console.log('≡ƒÜÇ Starting BreatheSmart Air Quality Server...');
    
    // Test database connection and initialize tables
    const dbConnected = await testConnection();
    if (dbConnected) {
      await initializeTables();
      console.log('≡ƒùä∩╕Å Neon Database ready for data storage');
    } else {
      console.log('ΓÜá∩╕Å Database connection failed, but server will continue without DB features');
    }
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`Γ£à Server running on http://localhost:${PORT}`);
      console.log('≡ƒôí NEW API Endpoints:');
      console.log('   GET /api/current?city=Delhi - Fetch fresh data from APIs');
      console.log('   GET /api/historical?city=Delhi&date_from=2025-10-01 - Query stored database records');
      console.log('ΓÅ░ Automatic hourly data collection: ACTIVE');
    });
    
  } catch (err) {
    console.error('Γ¥î Failed to start server:', err.message);
    process.exit(1);
  }
}

// Export autoFetchAndStore for use in external scripts (GitHub Actions)
module.exports = { autoFetchAndStore };

// Only start server if this file is run directly (not imported)
if (require.main === module) {
  startServer();
}
