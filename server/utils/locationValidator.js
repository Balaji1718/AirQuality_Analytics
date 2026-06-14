const { coerceNumber } = require('./normalize');

const INDIAN_CITIES = [
  { canonical: 'Delhi', state: 'Delhi', coordinates: { lat: 28.6139, lon: 77.2090 }, aliases: ['new delhi', 'nct delhi', 'delhi'] },
  { canonical: 'Mumbai', state: 'Maharashtra', coordinates: { lat: 19.0760, lon: 72.8777 }, aliases: ['bombay', 'mumbai'] },
  { canonical: 'Bengaluru', state: 'Karnataka', coordinates: { lat: 12.9716, lon: 77.5946 }, aliases: ['bangalore', 'bengaluru'] },
  { canonical: 'Chennai', state: 'Tamil Nadu', coordinates: { lat: 13.0827, lon: 80.2707 }, aliases: ['madras', 'chennai'] },
  { canonical: 'Kolkata', state: 'West Bengal', coordinates: { lat: 22.5726, lon: 88.3639 }, aliases: ['calcutta', 'kolkata'] },
  { canonical: 'Hyderabad', state: 'Telangana', coordinates: { lat: 17.3850, lon: 78.4867 }, aliases: ['hyderabad'] },
  { canonical: 'Pune', state: 'Maharashtra', coordinates: { lat: 18.5204, lon: 73.8567 }, aliases: ['poona', 'pune'] },
  { canonical: 'Ahmedabad', state: 'Gujarat', coordinates: { lat: 23.0225, lon: 72.5714 }, aliases: ['ahmedabad', 'amdavad'] },
  { canonical: 'Jaipur', state: 'Rajasthan', coordinates: { lat: 26.9124, lon: 75.7873 }, aliases: ['jaipur'] },
  { canonical: 'Lucknow', state: 'Uttar Pradesh', coordinates: { lat: 26.8467, lon: 80.9462 }, aliases: ['lucknow'] },
  { canonical: 'Kanpur', state: 'Uttar Pradesh', coordinates: { lat: 26.4499, lon: 80.3319 }, aliases: ['kanpur'] },
  { canonical: 'Nagpur', state: 'Maharashtra', coordinates: { lat: 21.1458, lon: 79.0882 }, aliases: ['nagpur'] },
  { canonical: 'Visakhapatnam', state: 'Andhra Pradesh', coordinates: { lat: 17.6868, lon: 83.2185 }, aliases: ['vizag', 'visakhapatnam'] },
  { canonical: 'Bhopal', state: 'Madhya Pradesh', coordinates: { lat: 23.2599, lon: 77.4126 }, aliases: ['bhopal'] },
  { canonical: 'Patna', state: 'Bihar', coordinates: { lat: 25.5941, lon: 85.1376 }, aliases: ['patna'] },
  { canonical: 'Gurugram', state: 'Haryana', coordinates: { lat: 28.4595, lon: 77.0266 }, aliases: ['gurgaon', 'gurugram'] },
  { canonical: 'Noida', state: 'Uttar Pradesh', coordinates: { lat: 28.5355, lon: 77.3910 }, aliases: ['noida'] },
  { canonical: 'Chandigarh', state: 'Chandigarh', coordinates: { lat: 30.7333, lon: 76.7794 }, aliases: ['chandigarh'] },
  { canonical: 'Coimbatore', state: 'Tamil Nadu', coordinates: { lat: 11.0168, lon: 76.9558 }, aliases: ['coimbatore'] },
  { canonical: 'Madurai', state: 'Tamil Nadu', coordinates: { lat: 9.9252, lon: 78.1198 }, aliases: ['madurai'] },
  { canonical: 'Salem', state: 'Tamil Nadu', coordinates: { lat: 11.6643, lon: 78.1460 }, aliases: ['salem'] },
  { canonical: 'Tirunelveli', state: 'Tamil Nadu', coordinates: { lat: 8.7139, lon: 77.7567 }, aliases: ['tirunelveli'] },
];

const STATE_ALIASES = {
  'karnataka': ['karnataka', 'ka'],
  'tamil nadu': ['tamil nadu', 'tn', 'madras state'],
  'maharashtra': ['maharashtra', 'mh'],
  'delhi': ['delhi', 'nct delhi', 'dl'],
  'west bengal': ['west bengal', 'wb'],
  'telangana': ['telangana', 'ts', 'tg'],
  'rajasthan': ['rajasthan', 'rj'],
  'uttar pradesh': ['uttar pradesh', 'up'],
  'haryana': ['haryana', 'hr'],
  'gujarat': ['gujarat', 'gj'],
  'bihar': ['bihar', 'br'],
  'texas': ['texas', 'tx'],
  'california': ['california', 'ca'],
  'new york': ['new york', 'ny'],
  'illinois': ['illinois', 'il'],
  'florida': ['florida', 'fl'],
  'washington': ['washington', 'wa'],
  'ontario': ['ontario', 'on'],
  'british columbia': ['british columbia', 'british comlumbia', 'bc'],
  'quebec': ['quebec', 'qc']
};

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCoordinates(latOrCoords, lon) {
  if (latOrCoords && typeof latOrCoords === 'object') {
    return {
      lat: coerceNumber(latOrCoords.lat ?? latOrCoords.latitude ?? latOrCoords[0]),
      lon: coerceNumber(latOrCoords.lon ?? latOrCoords.lng ?? latOrCoords.longitude ?? latOrCoords[1]),
    };
  }

  return {
    lat: coerceNumber(latOrCoords),
    lon: coerceNumber(lon),
  };
}

function levenshtein(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const dp = Array.from({ length: left.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= right.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[left.length][right.length];
}

function similarity(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  const maxLength = Math.max(left.length, right.length);
  if (!maxLength) return 1;
  return 1 - (levenshtein(left, right) / maxLength);
}

function extractPlaceParts(label = '') {
  const raw = String(label || '').trim();
  const withoutAgency = raw
    .replace(/\s+-\s+(CPCB|DPCC|SPCB|AQMS|EPA|WAQI|OpenAQ|Monitor|Monitoring Station).*$/i, '')
    .replace(/\b(station|monitoring site|monitor)\b/ig, '')
    .trim();

  return withoutAgency
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
}

function findIndianCity(value = '') {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  return INDIAN_CITIES.find(city => {
    const names = [city.canonical, city.state, ...(city.aliases || [])].map(normalizeText);
    return names.some(name =>
      normalized === name ||
      normalized.includes(name) ||
      name.includes(normalized) ||
      similarity(normalized, name) >= 0.82
    );
  }) || null;
}

function getAllIndianCities() {
  return INDIAN_CITIES.map(city => ({ ...city, aliases: [...city.aliases] }));
}

function isWithinIndiaBounds(lat, lon) {
  const nLat = coerceNumber(lat);
  const nLon = coerceNumber(lon);
  return Number.isFinite(nLat) && Number.isFinite(nLon) &&
    nLat >= 6 && nLat <= 37.5 &&
    nLon >= 68 && nLon <= 98;
}

function isWithinCityBounds(lat, lon, cityData, toleranceDegrees = 1.2) {
  if (!cityData?.coordinates) return true;
  const nLat = coerceNumber(lat);
  const nLon = coerceNumber(lon);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLon)) return false;

  return Math.abs(nLat - cityData.coordinates.lat) <= toleranceDegrees &&
    Math.abs(nLon - cityData.coordinates.lon) <= toleranceDegrees;
}

function getStandardCoordinates(city) {
  const match = findIndianCity(city);
  return match ? { ...match.coordinates } : null;
}

function validateLocationMatch(query, response, latOrCoords, lon, country, state) {
  const rawQuery = String(query || '').trim();
  const rawResponse = String(response || rawQuery || '').trim();
  const coords = parseCoordinates(latOrCoords, lon);
  const parts = extractPlaceParts(rawResponse);
  const displayCity = parts[0] || rawResponse || rawQuery;
  let inferredCountryRaw = country || (parts.length > 1 ? parts[parts.length - 1] : null);
  let inferredCountry = inferredCountryRaw || 'Unknown';
  if (/^(in|india)$/i.test(inferredCountry)) {
    inferredCountry = 'India';
  } else if (/^(us|usa|united states|united states of america)$/i.test(inferredCountry)) {
    inferredCountry = 'United States';
  } else if (/^(gb|uk|united kingdom)$/i.test(inferredCountry)) {
    inferredCountry = 'United Kingdom';
  } else if (/^(ca|canada)$/i.test(inferredCountry)) {
    inferredCountry = 'Canada';
  } else if (/^(au|australia)$/i.test(inferredCountry)) {
    inferredCountry = 'Australia';
  } else if (/^(jp|japan)$/i.test(inferredCountry)) {
    inferredCountry = 'Japan';
  } else if (/^(cn|china)$/i.test(inferredCountry)) {
    inferredCountry = 'China';
  } else if (/^(br|brazil)$/i.test(inferredCountry)) {
    inferredCountry = 'Brazil';
  }

  const queryCity = findIndianCity(rawQuery);
  const responseCity = findIndianCity(rawResponse) || findIndianCity(displayCity);

  let confidence = 0.35;
  let reason = 'weak_text_match';
  let canonicalCity = displayCity || rawQuery;
  let canonicalCountry = inferredCountry;

  const normalizedQuery = normalizeText(rawQuery);
  const normalizedResponse = normalizeText(rawResponse);
  const normalizedDisplay = normalizeText(displayCity);

  if (state) {
    const normTargetState = normalizeText(state);
    let matchedTargetAliasKey = Object.keys(STATE_ALIASES).find(key => 
      key === normTargetState || STATE_ALIASES[key].includes(normTargetState)
    );
    const targetAliases = matchedTargetAliasKey ? STATE_ALIASES[matchedTargetAliasKey] : [normTargetState];

    // Check if the response contains references to another state
    const normResponse = normalizeText(rawResponse);
    for (const [key, aliases] of Object.entries(STATE_ALIASES)) {
      // Skip the target state itself
      if (matchedTargetAliasKey && key === matchedTargetAliasKey) continue;
      if (!matchedTargetAliasKey && aliases.includes(normTargetState)) continue;

      // If response matches an alias of this other state
      const responseContainsOtherState = aliases.some(alias => {
        if (alias.length <= 2) {
          const regex = new RegExp(`\\b${alias}\\b`, 'i');
          return regex.test(normResponse);
        }
        return normResponse.includes(alias);
      });

      if (responseContainsOtherState) {
        // Verify if response does NOT contain any alias of our target state
        const responseContainsTargetState = targetAliases.some(alias => {
          if (alias.length <= 2) {
            const regex = new RegExp(`\\b${alias}\\b`, 'i');
            return regex.test(normResponse);
          }
          return normResponse.includes(alias);
        });

        if (!responseContainsTargetState) {
          return {
            isValid: false,
            confidence: 0,
            reason: 'state_mismatch',
            normalized: { city: canonicalCity, country: canonicalCountry, coordinates: coords }
          };
        }
      }
    }
  }

  if (queryCity && (!inferredCountry || /india|in/i.test(inferredCountry))) {
    canonicalCity = queryCity.canonical;
    canonicalCountry = 'India';
    confidence = 0.82;
    reason = 'known_city_alias';

    if (responseCity && responseCity.canonical !== queryCity.canonical) {
      return {
        isValid: false,
        confidence: 0,
        reason: 'city_mismatch_known_cities',
        normalized: { city: canonicalCity, country: canonicalCountry, coordinates: coords }
      };
    }

    if (responseCity?.canonical === queryCity.canonical) {
      confidence = 0.98;
      reason = 'known_city_provider_match';
    } else if (normalizedResponse.includes(normalizeText(queryCity.canonical))) {
      confidence = 0.93;
      reason = 'provider_label_contains_known_city';
    }

    if (Number.isFinite(coords.lat) && Number.isFinite(coords.lon)) {
      if (!isWithinIndiaBounds(coords.lat, coords.lon)) {
        return {
          isValid: false,
          confidence: 0,
          reason: 'coordinates_outside_india_for_known_indian_city',
          normalized: { city: canonicalCity, country: canonicalCountry, coordinates: coords }
        };
      }
      if (!isWithinCityBounds(coords.lat, coords.lon, queryCity, 2.2)) {
        return {
          isValid: false,
          confidence: 0,
          reason: 'coordinates_outside_city_bounds',
          normalized: { city: canonicalCity, country: canonicalCountry, coordinates: coords }
        };
      }
    }
  } else if (normalizedQuery && normalizedResponse) {
    if (normalizedResponse.includes(normalizedQuery) || normalizedDisplay.includes(normalizedQuery)) {
      confidence = 0.9;
      reason = 'provider_label_contains_query';
    } else if (normalizedQuery.includes(normalizedDisplay) && normalizedDisplay.length >= 3) {
      confidence = 0.82;
      reason = 'query_contains_provider_label';
    } else {
      const score = Math.max(similarity(normalizedQuery, normalizedDisplay), similarity(normalizedQuery, normalizedResponse));
      confidence = Math.max(confidence, score);
      reason = score >= 0.72 ? 'fuzzy_text_match' : 'low_confidence_text_match';
    }

    canonicalCity = displayCity || rawQuery;
    canonicalCountry = inferredCountry || canonicalCountry;
  }

  // Boost India-localized matches for context-aware ambiguous ranking
  if (canonicalCountry === 'India' && confidence > 0) {
    const foreignKeywords = ['us', 'usa', 'united states', 'oregon', 'uk', 'united kingdom', 'london', 'canada', 'australia', 'japan', 'china', 'brazil'];
    const specifiesForeign = foreignKeywords.some(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      return regex.test(normalizedQuery);
    });
    if (!specifiesForeign) {
      confidence = Math.min(1.0, confidence + 0.05);
      reason = `${reason}_india_boost`;
    }
  }

  return {
    isValid: confidence >= 0.55 || !rawResponse,
    confidence,
    reason,
    normalized: {
      city: canonicalCity,
      country: canonicalCountry,
      state: queryCity?.state || responseCity?.state || null,
      coordinates: coords,
      providerLabel: rawResponse,
    }
  };
}

module.exports = {
  validateLocationMatch,
  findIndianCity,
  getAllIndianCities,
  isWithinIndiaBounds,
  getStandardCoordinates,
  isWithinCityBounds,
  normalizeText,
  similarity,
};
