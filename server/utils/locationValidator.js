/**
 * Location Validation and Normalization System
 * Ensures accurate mapping between user input and fetched environmental data
 */

// Comprehensive Indian city database with coordinates and aliases
const INDIAN_CITIES = {
  // Major Metropolitan Cities
  'delhi': { 
    canonical: 'Delhi', 
    aliases: ['new delhi', 'delhi ncr', 'national capital territory'],
    coordinates: { lat: 28.6139, lon: 77.2090 },
    state: 'Delhi',
    bounds: { north: 28.8838, south: 28.4044, east: 77.3467, west: 76.8389 }
  },
  'mumbai': { 
    canonical: 'Mumbai', 
    aliases: ['bombay', 'mumbai city'],
    coordinates: { lat: 19.0760, lon: 72.8777 },
    state: 'Maharashtra',
    bounds: { north: 19.2700, south: 18.8900, east: 72.9800, west: 72.7700 }
  },
  'kolkata': { 
    canonical: 'Kolkata', 
    aliases: ['calcutta', 'kolkata city'],
    coordinates: { lat: 22.5726, lon: 88.3639 },
    state: 'West Bengal',
    bounds: { north: 22.6500, south: 22.4500, east: 88.4500, west: 88.2700 }
  },
  'chennai': { 
    canonical: 'Chennai', 
    aliases: ['madras', 'chennai city'],
    coordinates: { lat: 13.0827, lon: 80.2707 },
    state: 'Tamil Nadu',
    bounds: { north: 13.2300, south: 12.8300, east: 80.3200, west: 80.1200 }
  },
  'bengaluru': { 
    canonical: 'Bengaluru', 
    aliases: ['bangalore', 'bengaluru city', 'silicon valley of india'],
    coordinates: { lat: 12.9716, lon: 77.5946 },
    state: 'Karnataka',
    bounds: { north: 13.1500, south: 12.8400, east: 77.7800, west: 77.4600 }
  },
  'hyderabad': { 
    canonical: 'Hyderabad', 
    aliases: ['hyderabad city', 'cyberabad'],
    coordinates: { lat: 17.3850, lon: 78.4867 },
    state: 'Telangana',
    bounds: { north: 17.5600, south: 17.2000, east: 78.6500, west: 78.2500 }
  },

  // State Capitals and Major Cities
  'pune': { 
    canonical: 'Pune', 
    aliases: ['pune city', 'poona'],
    coordinates: { lat: 18.5204, lon: 73.8567 },
    state: 'Maharashtra',
    bounds: { north: 18.6400, south: 18.4000, east: 73.9800, west: 73.7300 }
  },
  'ahmedabad': { 
    canonical: 'Ahmedabad', 
    aliases: ['amdavad'],
    coordinates: { lat: 23.0225, lon: 72.5714 },
    state: 'Gujarat',
    bounds: { north: 23.1400, south: 22.9000, east: 72.7000, west: 72.4400 }
  },
  'jaipur': { 
    canonical: 'Jaipur', 
    aliases: ['pink city'],
    coordinates: { lat: 26.9124, lon: 75.7873 },
    state: 'Rajasthan',
    bounds: { north: 27.0500, south: 26.7700, east: 75.9000, west: 75.6700 }
  },
  'lucknow': { 
    canonical: 'Lucknow', 
    aliases: [],
    coordinates: { lat: 26.8467, lon: 80.9462 },
    state: 'Uttar Pradesh',
    bounds: { north: 26.9500, south: 26.7400, east: 81.0500, west: 80.8400 }
  },
  'kanpur': { 
    canonical: 'Kanpur', 
    aliases: ['cawnpore'],
    coordinates: { lat: 26.4499, lon: 80.3319 },
    state: 'Uttar Pradesh',
    bounds: { north: 26.5500, south: 26.3500, east: 80.4500, west: 80.2100 }
  },
  'nagpur': { 
    canonical: 'Nagpur', 
    aliases: [],
    coordinates: { lat: 21.1458, lon: 79.0882 },
    state: 'Maharashtra',
    bounds: { north: 21.2500, south: 21.0400, east: 79.2000, west: 78.9800 }
  },
  'indore': { 
    canonical: 'Indore', 
    aliases: [],
    coordinates: { lat: 22.7196, lon: 75.8577 },
    state: 'Madhya Pradesh',
    bounds: { north: 22.8000, south: 22.6400, east: 75.9500, west: 75.7600 }
  },
  'thane': { 
    canonical: 'Thane', 
    aliases: [],
    coordinates: { lat: 19.2183, lon: 72.9781 },
    state: 'Maharashtra',
    bounds: { north: 19.3000, south: 19.1400, east: 73.0500, west: 72.9000 }
  },
  'bhopal': { 
    canonical: 'Bhopal', 
    aliases: ['city of lakes'],
    coordinates: { lat: 23.2599, lon: 77.4126 },
    state: 'Madhya Pradesh',
    bounds: { north: 23.3500, south: 23.1700, east: 77.5000, west: 77.3200 }
  },
  'visakhapatnam': { 
    canonical: 'Visakhapatnam', 
    aliases: ['vizag', 'vishakhapatnam'],
    coordinates: { lat: 17.6868, lon: 83.2185 },
    state: 'Andhra Pradesh',
    bounds: { north: 17.8000, south: 17.5700, east: 83.3500, west: 83.0900 }
  },
  'pimpri-chinchwad': { 
    canonical: 'Pimpri-Chinchwad', 
    aliases: ['pcmc'],
    coordinates: { lat: 18.6298, lon: 73.7997 },
    state: 'Maharashtra',
    bounds: { north: 18.7000, south: 18.5600, east: 73.8800, west: 73.7200 }
  },
  'patna': { 
    canonical: 'Patna', 
    aliases: [],
    coordinates: { lat: 25.5941, lon: 85.1376 },
    state: 'Bihar',
    bounds: { north: 25.7000, south: 25.4900, east: 85.2500, west: 85.0200 }
  },
  'vadodara': { 
    canonical: 'Vadodara', 
    aliases: ['baroda'],
    coordinates: { lat: 22.3072, lon: 73.1812 },
    state: 'Gujarat',
    bounds: { north: 22.3900, south: 22.2200, east: 73.2600, west: 73.1000 }
  },
  'ghaziabad': { 
    canonical: 'Ghaziabad', 
    aliases: [],
    coordinates: { lat: 28.6692, lon: 77.4538 },
    state: 'Uttar Pradesh',
    bounds: { north: 28.7500, south: 28.5900, east: 77.5400, west: 77.3700 }
  },
  'ludhiana': { 
    canonical: 'Ludhiana', 
    aliases: [],
    coordinates: { lat: 30.9010, lon: 75.8573 },
    state: 'Punjab',
    bounds: { north: 30.9800, south: 30.8200, east: 75.9400, west: 75.7700 }
  },
  'agra': { 
    canonical: 'Agra', 
    aliases: ['city of taj'],
    coordinates: { lat: 27.1767, lon: 78.0081 },
    state: 'Uttar Pradesh',
    bounds: { north: 27.2500, south: 27.1000, east: 78.1000, west: 77.9200 }
  },
  'nashik': { 
    canonical: 'Nashik', 
    aliases: ['nasik'],
    coordinates: { lat: 19.9975, lon: 73.7898 },
    state: 'Maharashtra',
    bounds: { north: 20.0800, south: 19.9100, east: 73.8800, west: 73.7000 }
  },
  'faridabad': { 
    canonical: 'Faridabad', 
    aliases: [],
    coordinates: { lat: 28.4089, lon: 77.3178 },
    state: 'Haryana',
    bounds: { north: 28.4900, south: 28.3300, east: 77.4000, west: 77.2400 }
  },
  'meerut': { 
    canonical: 'Meerut', 
    aliases: [],
    coordinates: { lat: 28.9845, lon: 77.7064 },
    state: 'Uttar Pradesh',
    bounds: { north: 29.0600, south: 28.9100, east: 77.7900, west: 77.6200 }
  },
  'rajkot': { 
    canonical: 'Rajkot', 
    aliases: [],
    coordinates: { lat: 22.3039, lon: 70.8022 },
    state: 'Gujarat',
    bounds: { north: 22.3800, south: 22.2300, east: 70.8800, west: 70.7200 }
  },
  'kalyan-dombivli': { 
    canonical: 'Kalyan-Dombivli', 
    aliases: ['kalyan', 'dombivli'],
    coordinates: { lat: 19.2403, lon: 73.1305 },
    state: 'Maharashtra',
    bounds: { north: 19.3000, south: 19.1800, east: 73.2000, west: 73.0600 }
  },
  'vasai-virar': { 
    canonical: 'Vasai-Virar', 
    aliases: ['vasai', 'virar'],
    coordinates: { lat: 19.4914, lon: 72.8054 },
    state: 'Maharashtra',
    bounds: { north: 19.5600, south: 19.4200, east: 72.8800, west: 72.7300 }
  },
  'varanasi': { 
    canonical: 'Varanasi', 
    aliases: ['benares', 'kashi'],
    coordinates: { lat: 25.3176, lon: 82.9739 },
    state: 'Uttar Pradesh',
    bounds: { north: 25.4000, south: 25.2400, east: 83.0500, west: 82.8900 }
  },
  'srinagar': { 
    canonical: 'Srinagar', 
    aliases: [],
    coordinates: { lat: 34.0837, lon: 74.7973 },
    state: 'Jammu and Kashmir',
    bounds: { north: 34.1500, south: 34.0200, east: 74.8600, west: 74.7300 }
  },
  'aurangabad': { 
    canonical: 'Aurangabad', 
    aliases: [],
    coordinates: { lat: 19.8762, lon: 75.3433 },
    state: 'Maharashtra',
    bounds: { north: 19.9500, south: 19.8000, east: 75.4200, west: 75.2700 }
  },
  'dhanbad': { 
    canonical: 'Dhanbad', 
    aliases: [],
    coordinates: { lat: 23.7957, lon: 86.4304 },
    state: 'Jharkhand',
    bounds: { north: 23.8600, south: 23.7300, east: 86.5000, west: 86.3600 }
  },
  'amritsar': { 
    canonical: 'Amritsar', 
    aliases: [],
    coordinates: { lat: 31.6340, lon: 74.8723 },
    state: 'Punjab',
    bounds: { north: 31.7000, south: 31.5700, east: 74.9400, west: 74.8000 }
  },
  'navi mumbai': { 
    canonical: 'Navi Mumbai', 
    aliases: ['new mumbai'],
    coordinates: { lat: 19.0330, lon: 73.0297 },
    state: 'Maharashtra',
    bounds: { north: 19.1200, south: 18.9500, east: 73.1200, west: 72.9400 }
  },
  'allahabad': { 
    canonical: 'Allahabad', 
    aliases: ['prayagraj'],
    coordinates: { lat: 25.4358, lon: 81.8463 },
    state: 'Uttar Pradesh',
    bounds: { north: 25.5200, south: 25.3500, east: 81.9300, west: 81.7600 }
  },
  'ranchi': { 
    canonical: 'Ranchi', 
    aliases: [],
    coordinates: { lat: 23.3441, lon: 85.3096 },
    state: 'Jharkhand',
    bounds: { north: 23.4300, south: 23.2600, east: 85.4000, west: 85.2200 }
  },
  'howrah': { 
    canonical: 'Howrah', 
    aliases: [],
    coordinates: { lat: 22.5958, lon: 88.2636 },
    state: 'West Bengal',
    bounds: { north: 22.6500, south: 22.5400, east: 88.3200, west: 88.2000 }
  },
  'coimbatore': { 
    canonical: 'Coimbatore', 
    aliases: ['kovai'],
    coordinates: { lat: 11.0168, lon: 76.9558 },
    state: 'Tamil Nadu',
    bounds: { north: 11.1000, south: 10.9300, east: 77.0400, west: 76.8700 }
  },
  'jabalpur': { 
    canonical: 'Jabalpur', 
    aliases: ['jubbulpore'],
    coordinates: { lat: 23.1815, lon: 79.9864 },
    state: 'Madhya Pradesh',
    bounds: { north: 23.2600, south: 23.1000, east: 80.0700, west: 79.9000 }
  },
  'gwalior': { 
    canonical: 'Gwalior', 
    aliases: [],
    coordinates: { lat: 26.2183, lon: 78.1828 },
    state: 'Madhya Pradesh',
    bounds: { north: 26.3000, south: 26.1400, east: 78.2600, west: 78.1000 }
  },
  'vijayawada': { 
    canonical: 'Vijayawada', 
    aliases: ['bezawada'],
    coordinates: { lat: 16.5062, lon: 80.6480 },
    state: 'Andhra Pradesh',
    bounds: { north: 16.5800, south: 16.4300, east: 80.7200, west: 80.5800 }
  },
  'jodhpur': { 
    canonical: 'Jodhpur', 
    aliases: ['blue city'],
    coordinates: { lat: 26.2389, lon: 73.0243 },
    state: 'Rajasthan',
    bounds: { north: 26.3200, south: 26.1600, east: 73.1000, west: 72.9500 }
  },
  'madurai': { 
    canonical: 'Madurai', 
    aliases: ['temple city'],
    coordinates: { lat: 9.9252, lon: 78.1198 },
    state: 'Tamil Nadu',
    bounds: { north: 10.0000, south: 9.8500, east: 78.2000, west: 78.0400 }
  },
  'raipur': { 
    canonical: 'Raipur', 
    aliases: [],
    coordinates: { lat: 21.2514, lon: 81.6296 },
    state: 'Chhattisgarh',
    bounds: { north: 21.3300, south: 21.1700, east: 81.7100, west: 81.5500 }
  },
  'kota': { 
    canonical: 'Kota', 
    aliases: [],
    coordinates: { lat: 25.2138, lon: 75.8648 },
    state: 'Rajasthan',
    bounds: { north: 25.2900, south: 25.1400, east: 75.9400, west: 75.7900 }
  }
};

// Indian state boundaries for validation
const INDIA_BOUNDS = {
  north: 37.6,   // Kashmir
  south: 6.4,    // Tamil Nadu
  east: 97.25,   // Arunachal Pradesh
  west: 68.7     // Gujarat
};

/**
 * Normalize city name for lookup
 */
function normalizeCityName(cityName) {
  if (!cityName) return null;
  
  return cityName
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters except hyphens and spaces
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
}

/**
 * Find Indian city by name or alias
 */
function findIndianCity(cityName) {
  const normalized = normalizeCityName(cityName);
  if (!normalized) return null;

  // Direct match
  if (INDIAN_CITIES[normalized]) {
    return INDIAN_CITIES[normalized];
  }

  // Search by aliases
  for (const [key, cityData] of Object.entries(INDIAN_CITIES)) {
    if (cityData.aliases.some(alias => 
      normalizeCityName(alias) === normalized
    )) {
      return cityData;
    }
  }

  // Partial match for compound names
  for (const [key, cityData] of Object.entries(INDIAN_CITIES)) {
    if (key.includes(normalized) || normalized.includes(key)) {
      return cityData;
    }
  }

  return null;
}

/**
 * Validate coordinates are within Indian boundaries
 */
function isWithinIndiaBounds(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (isNaN(lat) || isNaN(lon)) return false;
  
  // Basic bounds check
  if (lat < INDIA_BOUNDS.south || lat > INDIA_BOUNDS.north || 
      lon < INDIA_BOUNDS.west || lon > INDIA_BOUNDS.east) {
    return false;
  }
  
  // Exclude Pakistan coordinates (like Islamabad: 33.6844, 73.0479)
  if (lat > 32.0 && lat < 37.0 && lon > 72.0 && lon < 76.0) {
    return false; // This region is primarily Pakistan
  }
  
  // Exclude Bangladesh coordinates
  if (lat > 20.5 && lat < 26.8 && lon > 88.5 && lon < 93.0) {
    // But allow West Bengal (roughly 22-27°N, 85.5-89.0°E)
    if (lat >= 22.0 && lat <= 27.0 && lon >= 85.5 && lon <= 89.0) {
      return true; // West Bengal, India
    }
    return false; // Likely Bangladesh
  }
  
  return true;
}

/**
 * Validate if coordinates are within city bounds
 */
function isWithinCityBounds(lat, lon, cityData) {
  if (!cityData.bounds) return isWithinIndiaBounds(lat, lon);
  
  return lat >= cityData.bounds.south && 
         lat <= cityData.bounds.north && 
         lon >= cityData.bounds.west && 
         lon <= cityData.bounds.east;
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
           Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
           Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Check if query is an Indian state name
 */
function findIndianState(query) {
  const indianStates = {
    'kerala': { name: 'Kerala', capitals: ['Thiruvananthapuram'], majorCities: ['Kochi', 'Kozhikode'] },
    'tamil nadu': { name: 'Tamil Nadu', capitals: ['Chennai'], majorCities: ['Chennai', 'Coimbatore', 'Madurai'] },
    'karnataka': { name: 'Karnataka', capitals: ['Bengaluru'], majorCities: ['Bengaluru', 'Mysuru', 'Hubli'] },
    'andhra pradesh': { name: 'Andhra Pradesh', capitals: ['Amaravati'], majorCities: ['Visakhapatnam', 'Vijayawada'] },
    'telangana': { name: 'Telangana', capitals: ['Hyderabad'], majorCities: ['Hyderabad', 'Warangal'] },
    'maharashtra': { name: 'Maharashtra', capitals: ['Mumbai'], majorCities: ['Mumbai', 'Pune', 'Nagpur'] },
    'gujarat': { name: 'Gujarat', capitals: ['Gandhinagar'], majorCities: ['Ahmedabad', 'Surat', 'Vadodara'] },
    'rajasthan': { name: 'Rajasthan', capitals: ['Jaipur'], majorCities: ['Jaipur', 'Jodhpur', 'Udaipur'] },
    'west bengal': { name: 'West Bengal', capitals: ['Kolkata'], majorCities: ['Kolkata', 'Howrah'] },
    'uttar pradesh': { name: 'Uttar Pradesh', capitals: ['Lucknow'], majorCities: ['Kanpur', 'Lucknow', 'Agra'] },
    'bihar': { name: 'Bihar', capitals: ['Patna'], majorCities: ['Patna', 'Gaya'] },
    'madhya pradesh': { name: 'Madhya Pradesh', capitals: ['Bhopal'], majorCities: ['Bhopal', 'Indore'] },
    'odisha': { name: 'Odisha', capitals: ['Bhubaneswar'], majorCities: ['Bhubaneswar'] },
    'punjab': { name: 'Punjab', capitals: ['Chandigarh'], majorCities: ['Ludhiana', 'Amritsar'] },
    'haryana': { name: 'Haryana', capitals: ['Chandigarh'], majorCities: ['Faridabad', 'Gurgaon'] },
    'delhi': { name: 'Delhi', capitals: ['New Delhi'], majorCities: ['Delhi'] }
  };
  
  const queryNormalized = query.toLowerCase().trim();
  return indianStates[queryNormalized] || null;
}

/**
 * Validate location response matches the original query
 */
function validateLocationMatch(queryCity, responseLocation, lat, lon, country) {
  const expectedCity = findIndianCity(queryCity);
  const indianState = findIndianState(queryCity);
  
  if (!expectedCity && !indianState) {
    // Handle non-Indian locations with geographic validation
    const isInIndia = country && (
      country.toLowerCase().includes('india') ||
      country.toLowerCase().includes('in') ||
      (lat && lon && isWithinIndiaBounds(lat, lon))
    );
    
    if (isInIndia && lat && lon && isWithinIndiaBounds(lat, lon)) {
      return {
        isValid: true,
        confidence: 0.6,
        reason: 'Location within India bounds',
        normalized: {
          city: queryCity,
          country: 'India',
          coordinates: { lat: parseFloat(lat), lon: parseFloat(lon) }
        }
      };
    } else {
      return {
        isValid: false,
        confidence: 0.0,
        reason: 'Location not in India or coordinates invalid',
        normalized: null
      };
    }
  }
  
  // Handle Indian state queries
  if (indianState && !expectedCity) {
    return {
      isValid: false,
      confidence: 0.3,
      reason: `${indianState.name} is a state - need specific city name`,
      suggestion: `Try: ${indianState.majorCities.join(', ')}`,
      normalized: {
        state: indianState.name,
        country: 'India',
        suggestedCities: indianState.majorCities
      }
    };
  }

  // Validate Indian cities strictly
  const validation = {
    isValid: false,
    confidence: 0,
    reason: '',
    normalized: {
      city: expectedCity.canonical,
      state: expectedCity.state,
      country: 'India',
      coordinates: expectedCity.coordinates
    }
  };

  // Check if response location name matches expected city
  const responseNormalized = normalizeCityName(responseLocation);
  const queryNormalized = normalizeCityName(queryCity);
  
  let nameMatch = false;
  if (responseNormalized === normalizeCityName(expectedCity.canonical)) {
    nameMatch = true;
    validation.confidence += 0.4;
  } else if (expectedCity.aliases.some(alias => 
    normalizeCityName(alias) === responseNormalized
  )) {
    nameMatch = true;
    validation.confidence += 0.3;
  } else if (responseNormalized && responseNormalized.includes(queryNormalized)) {
    nameMatch = true;
    validation.confidence += 0.2;
  }

  // Check coordinates if available
  if (lat && lon) {
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);
    
    if (isWithinCityBounds(latitude, longitude, expectedCity)) {
      validation.confidence += 0.4;
      validation.normalized.coordinates = { lat: latitude, lon: longitude };
    } else if (isWithinIndiaBounds(latitude, longitude)) {
      validation.confidence += 0.2;
      validation.normalized.coordinates = { lat: latitude, lon: longitude };
    } else {
      validation.confidence -= 0.3;
      validation.reason = 'Coordinates outside expected region';
    }
    
    // Check distance from expected coordinates
    const distance = calculateDistance(
      latitude, longitude,
      expectedCity.coordinates.lat, expectedCity.coordinates.lon
    );
    
    if (distance <= 50) { // Within 50km
      validation.confidence += 0.2;
    } else if (distance <= 200) { // Within 200km
      validation.confidence += 0.1;
    } else {
      validation.confidence -= 0.2;
      validation.reason += ` Distance from expected location: ${distance.toFixed(1)}km`;
    }
  }

  // Final validation
  validation.isValid = validation.confidence >= 0.6 && nameMatch;
  
  if (!validation.isValid) {
    if (!nameMatch) {
      validation.reason = `Location name mismatch: expected "${expectedCity.canonical}", got "${responseLocation}"`;
    }
    if (validation.confidence < 0.6) {
      validation.reason += ` Low confidence score: ${validation.confidence.toFixed(2)}`;
    }
  }

  return validation;
}

/**
 * Get standardized coordinates for a city
 */
function getStandardCoordinates(cityName) {
  const cityData = findIndianCity(cityName);
  return cityData ? cityData.coordinates : null;
}

/**
 * Get all supported Indian cities
 */
function getSupportedCities() {
  return Object.values(INDIAN_CITIES).map(city => ({
    name: city.canonical,
    state: city.state,
    aliases: city.aliases,
    coordinates: city.coordinates
  }));
}

/**
 * Search for cities with fuzzy matching
 */
function searchCities(query, limit = 10) {
  const normalized = normalizeCityName(query);
  if (!normalized) return [];
  
  const results = [];
  
  for (const [key, cityData] of Object.entries(INDIAN_CITIES)) {
    let score = 0;
    
    // Exact match
    if (key === normalized) {
      score = 1.0;
    } else if (key.startsWith(normalized)) {
      score = 0.8;
    } else if (key.includes(normalized)) {
      score = 0.6;
    } else if (cityData.aliases.some(alias => 
      normalizeCityName(alias).includes(normalized)
    )) {
      score = 0.4;
    }
    
    if (score > 0) {
      results.push({
        city: cityData.canonical,
        state: cityData.state,
        score: score,
        coordinates: cityData.coordinates
      });
    }
  }
  
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Helper function to get all Indian cities for API endpoints
function getAllIndianCities() {
  return Object.keys(INDIAN_CITIES).map(canonical => ({
    canonical,
    ...INDIAN_CITIES[canonical]
  }));
}

module.exports = {
  findIndianCity,
  findIndianState,
  getAllIndianCities,
  validateLocationMatch,
  isWithinIndiaBounds,
  isWithinCityBounds,
  getStandardCoordinates,
  getSupportedCities,
  searchCities,
  calculateDistance,
  normalizeCityName,
  INDIAN_CITIES,
  INDIA_BOUNDS
};