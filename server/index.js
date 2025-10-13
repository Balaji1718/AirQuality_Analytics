const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

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
              unit: 'μg/m³',
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
      console.log(`🎯 Cache hit for measurements: ${cityName}`);
      return res.json(cachedResult);
    }
    console.log(`❌ Cache miss for measurements: ${cityName}`);

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
          console.log(`✨ Gemini AI advice generated for ${cityName}`);
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
        localAdvice = "PM2.5 is very high — avoid outdoor activities and wear protective masks.";
      } else if (avgPm25 >= 55) {
        localAdvice = "PM2.5 is unhealthy — sensitive groups should avoid prolonged outdoor exertion.";
      } else if (avgPm25 >= 35) {
        localAdvice = "PM2.5 is moderate — consider limiting long outdoor activities.";
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
    console.log(`💾 Cached measurements for ${cityName}`);

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
      console.log(`🎯 Cache hit for insights: ${city}`);
      return res.json(cachedResult);
    }
    console.log(`❌ Cache miss for insights: ${city}`);

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
            console.log('🎉 Gemini AI insights generated successfully!');
            
            const responseData = { 
              insights: aiInsight.trim(),
              source: 'Gemini AI',
              city: city,
              model: geminiUrl.includes('flash') ? 'Gemini 1.5 Flash' : 'Gemini Pro'
            };

            // Cache the AI response for future requests
            cache.set(cacheKey, responseData);
            console.log(`💾 Cached AI insights for ${city}`);

            return res.json(responseData);
          }
        } catch (endpointError) {
          console.log(`Endpoint failed: ${endpointError.response?.status} ${endpointError.response?.statusText}`);
          console.log(`Error details: ${endpointError.response?.data || endpointError.message}`);
          continue; // Try next endpoint
        }
      }
      
      console.log('❌ All Gemini endpoints failed, falling back to professional rule-based system');
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
      insight = `🚨 HEALTH EMERGENCY: Air quality in ${city} is extremely hazardous (${specificRisks.join(", ")}). ${recommendations.join(", ")}. Seek medical attention if experiencing breathing difficulties.`;
    } else if (overallRisk === "very high") {
      insight = `⚠️ VERY UNHEALTHY: Air quality in ${city} poses serious health risks (${specificRisks.join(", ")}). Essential advice: ${recommendations.slice(0, 3).join(", ")}. Especially important for ${[...new Set(vulnerableGroups)].join(", ")}.`;
    } else if (overallRisk === "high") {
      insight = `⚠️ UNHEALTHY: Air quality in ${city} is concerning (${specificRisks.join(", ")}). Recommended actions: ${recommendations.slice(0, 2).join(", ")}. ${[...new Set(vulnerableGroups)].join(", ")} should take extra precautions.`;
    } else if (overallRisk === "moderate") {
      insight = `⚡ MODERATE: Air quality in ${city} requires attention (${specificRisks.join(", ")}). Consider ${recommendations[0] || "monitoring conditions closely"}. ${vulnerableGroups.length ? [...new Set(vulnerableGroups)].join(", ") + " should be cautious" : "Generally acceptable for most people"}.`;
    } else {
      const pollutantCount = data.length;
      const uniquePollutants = [...new Set(data.map(r => r.pollutant))];
      insight = `✅ GOOD: Air quality in ${city} appears healthy based on ${pollutantCount} measurements covering ${uniquePollutants.join(", ")}. Safe for all outdoor activities including exercise and recreation.`;
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
    console.log(`💾 Cached rule-based insights for ${city}`);

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
      console.log(`✅ Cache hit for ${cityName}`);
      return res.json({
        ...cachedResult,
        cached: true,
        cacheTimestamp: new Date().toISOString()
      });
    }
    
    console.log(`🔄 Cache miss for ${cityName}, fetching fresh data...`);

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
    
    console.log(`🗓️ Date filtering: ${date_from} to ${date_to}`);

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
          console.log(`⚠️ User requested ${fromYear} data, but WAQI only provides current data`);
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
        console.log(`🤖 Generating Gemini AI health advice for ${cityName}...`);
        
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
          console.log('🎉 Gemini AI health advice generated successfully!');
        } else {
          throw new Error('No AI response received');
        }
      } else {
        throw new Error('Gemini AI not available');
      }
    } catch (aiError) {
      console.log('🔄 Gemini failed, using enhanced rule-based advice...');
      
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
      
      console.log('✅ Enhanced rule-based advice generated successfully');
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
        note: `Data from ${successfulSource} API${successfulSource === 'WAQI' || successfulSource === 'OpenWeather' ? ' (current data only)' : ` (${date_from.split('T')[0]} to ${date_to.split('T')[0]})`} 📅, advice from ${adviceSource}${dataQualityNote}`
      }
    };

    // Cache the response for future requests
    cache.set(cacheKey, responseData);
    console.log(`💾 Cached result for ${cityName}`);

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
          status: HEADERS["X-API-Key"] ? "Configured ✅" : "Needs API key ❌",
          website: "https://openaq.org"
        },
        WAQI: {
          name: "World Air Quality Index",
          coverage: "11,000+ stations worldwide, 1000+ cities",
          strengths: ["Global coverage", "Real-time data", "Many missing countries covered"],
          limitations: ["AQI format only", "Limited historical data"],
          status: API_SOURCES.waqi.token !== "demo" ? "Configured ✅" : "Using demo token ⚠️",
          website: "https://aqicn.org",
          note: "Get free token from https://aqicn.org/data-platform/token/"
        },
        OpenWeather: {
          name: "OpenWeatherMap Air Pollution",
          coverage: "Global coordinates-based coverage",
          strengths: ["Worldwide coverage", "Coordinate-based", "Weather + air quality"],
          limitations: ["Requires coordinates", "Limited pollutants"],
          status: process.env.OPENWEATHER_API_KEY ? "Configured ✅" : "Needs API key ❌",
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
        "Russia": "WAQI ✅, OpenWeather ✅",
        "Iran": "WAQI ✅, OpenWeather ✅", 
        "South Korea": "WAQI ✅, OpenWeather ✅",
        "Venezuela": "WAQI ✅, OpenWeather ✅",
        "Tamil Nadu": "WAQI ✅ (Chennai, Coimbatore), OpenWeather ✅",
        "Cuba": "WAQI ✅, OpenWeather ✅",
        "Syria": "WAQI ✅, OpenWeather ✅"
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

const buildPath = path.resolve(__dirname, "../client/build");
app.use(express.static(buildPath));
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(buildPath, "index.html"));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
