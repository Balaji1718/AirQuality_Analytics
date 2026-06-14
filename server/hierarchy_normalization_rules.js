/**
 * Hierarchy Normalization Rules & Validators
 * 
 * Implements data quality gates for hierarchy pipeline:
 * - City label sanitization
 * - Cross-country leakage detection
 * - Duplicate suppression by canonical key
 * - Unknown region filtering
 * - Station-label filtering
 */

const crypto = require('crypto');
const { coerceNumber } = require('./utils/normalize');

/**
 * Normalize a city display name from raw station label
 * Returns: { display_name, is_station_label, raw_label }
 */
function normalizeCityLabel(rawLabel) {
  if (!rawLabel) return { display_name: null, is_station_label: false, raw_label: rawLabel };

  const trimmed = String(rawLabel).trim();
  
  // Detect station-label patterns
  const isStationLabel = 
    / - /.test(trimmed) ||  // Name - Agency (explicit separator)
    /^[A-Z0-9]{2,}\s*-\s+/.test(trimmed) ||  // CODE - Label (strict: dash + space)
    /\bStn\b/i.test(trimmed) ||  // "Stn" token indicates station
    /\b(station|site|monitor|monitoring)\b/i.test(trimmed) ||
    /\b(DPCC|CPCB|WAQI|OpenAQ|AQMS|EPA|CEU)\b/i.test(trimmed);  // Known agency markers

  let displayName = trimmed;
  if (isStationLabel) {
    // Try to extract human-readable part
    const parts = trimmed.split(/\s*[-,]\s*/);
    if (parts.length > 0 && parts[0].length > 0) {
      displayName = parts[0].trim();
    }
  }

  return {
    display_name: displayName,
    is_station_label: isStationLabel,
    raw_label: trimmed
  };
}

/**
 * Generate canonical city key for deduplication
 * Canonical key = MD5(normalized_display_name + country_id + geo_bucket)
 */
function generateCanonicalCityKey(displayName, countryId, lat, lon) {
  if (!displayName || !countryId) return null;

  // Geo-bucket: round to 0.1 degree (~10km)
  const geoBucket = [
    Math.round((lat || 0) * 10) / 10,
    Math.round((lon || 0) * 10) / 10
  ];

  const normalized = displayName
    .toLowerCase()
    .replace(/[^\w\s]/g, '')  // Remove special chars
    .replace(/\s+/g, '_')
    .substring(0, 50);

  const key = `${normalized}__${countryId}__${geoBucket.join(',')}`;
  return crypto.createHash('md5').update(key).digest('hex');
}

/**
 * Detect cross-country leakage: same city label across many countries is suspicious
 * Returns: { is_suspicious, country_count, countries }
 */
function detectCrossCountryLeakage(displayName, occurrences) {
  // occurrences = [ { country_id, country_name, lat, lon }, ... ]
  if (!occurrences || occurrences.length < 2) {
    return { is_suspicious: false, country_count: 1, countries: [] };
  }

  const countryCount = occurrences.length;
  const countries = occurrences.map(o => o.country_name);

  // Heuristic: same exact label in >10 unrelated countries is almost certainly a leak
  const isSuspicious = countryCount > 10;

  return { is_suspicious: isSuspicious, country_count: countryCount, countries };
}

/**
 * Validate city record for quality issues
 * Returns: { valid, issues: [] }
 */
function validateCityRecord(city, countryName, stateName) {
  const issues = [];

  if (!city || !city.name) {
    issues.push('missing_name');
  }

  // Check coordinates - support both formats (latitude/longitude and lat/lon)
  const rawLat = city?.coordinates?.latitude !== undefined ? city.coordinates.latitude : city?.coordinates?.lat;
  const rawLon = city?.coordinates?.longitude !== undefined ? city.coordinates.longitude : city?.coordinates?.lon;
  const lat = coerceNumber(rawLat);
  const lon = coerceNumber(rawLon);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);

  if (!hasCoords) {
    issues.push('invalid_coordinates');
  }

  // Check coordinate plausibility for country
  if (hasCoords && countryName) {
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      issues.push('out_of_bounds_coords');
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Validate state record
 * Returns: { valid, issues: [] }
 */
function validateStateRecord(state) {
  const issues = [];

  if (!state || !state.name) {
    issues.push('missing_name');
  }

  if (state.name && /^unknown/i.test(state.name)) {
    issues.push('unknown_placeholder');
  }

  return {
    valid: issues.length === 0 && !issues.includes('unknown_placeholder'),
    issues
  };
}

/**
 * Quality gate checks (read-only)
 * Returns: { passes, report }
 */
function validateHierarchyQuality(hierarchy) {
  const report = {
    timestamp: new Date().toISOString(),
    total_countries: 0,
    total_states: 0,
    total_cities: 0,
    issues: {
      unknown_regions: 0,
      station_label_cities: 0,
      invalid_coordinates: 0,
      cross_country_leaks: [],
      malformed_records: 0
    }
  };

  if (!hierarchy.supported_countries) {
    return { passes: false, report: { ...report, error: 'missing_supported_countries' } };
  }

  const cityNameToCountries = {};

  for (const [countryName, countryData] of Object.entries(hierarchy.supported_countries)) {
    if (!countryData || !countryData.regions) continue;
    report.total_countries++;

    for (const [stateName, stateData] of Object.entries(countryData.regions || {})) {
      if (!stateData) continue;
      report.total_states++;

      if (/^unknown/i.test(stateName)) {
        report.issues.unknown_regions++;
      }

      for (const city of (stateData.cities || [])) {
        report.total_cities++;

        const norm = normalizeCityLabel(city.name);
        if (norm.is_station_label) {
          report.issues.station_label_cities++;
        }

        // Track cross-country occurrences
        const key = (city.name || '').toLowerCase();
        if (!cityNameToCountries[key]) {
          cityNameToCountries[key] = [];
        }
        cityNameToCountries[key].push(countryName);
      }
    }
  }

  // Detect cross-country leakage
  for (const [cityName, countries] of Object.entries(cityNameToCountries)) {
    const unique = [...new Set(countries)];
    if (unique.length > 10) {
      report.issues.cross_country_leaks.push({
        city_name: cityName,
        country_count: unique.length,
        countries: unique
      });
    }
  }

  const passes = 
    report.issues.unknown_regions === 0 &&
    report.issues.station_label_cities < (report.total_cities * 0.05) &&  // <5% station labels acceptable for now
    report.issues.cross_country_leaks.length < (report.total_cities * 0.05);

  return { passes, report };
}

module.exports = {
  normalizeCityLabel,
  generateCanonicalCityKey,
  detectCrossCountryLeakage,
  validateCityRecord,
  validateStateRecord,
  validateHierarchyQuality
};
