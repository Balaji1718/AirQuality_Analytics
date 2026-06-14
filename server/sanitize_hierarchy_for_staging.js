/**
 * Hierarchy Sanitizer & Deduplicator
 * 
 * Reads current aqi_coverage_map.json, applies normalization rules,
 * generates sanitized artifact for staging-only use.
 * 
 * Run: node sanitize_hierarchy_for_staging.js [--output=path]
 */

const fs = require('fs');
const path = require('path');
const { normalizeCityLabel, generateCanonicalCityKey, validateStateRecord, validateHierarchyQuality } = require('./hierarchy_normalization_rules');
const { coerceNumber } = require('./utils/normalize');

const inputPath = path.join(__dirname, 'aqi_coverage_map.json');
const outputPath = path.join(__dirname, `aqi_coverage_map_sanitized_${new Date().toISOString().split('T')[0]}.json`);

const stats = {
  input_countries: 0,
  output_countries: 0,
  input_states: 0,
  output_states: 0,
  input_cities: 0,
  output_cities: 0,
  retained_by_country: {},
  removed_by_rule: {
    malformed_country_key: 0,
    invalid_country_shape: 0,
    placeholder_state_normalized: 0,
    invalid_state: 0,
    invalid_city_record: 0,
    station_label_only: 0,
    cross_country_duplicate: 0,
    invalid_coordinates: 0
  },
  removed_examples: {
    malformed_country_key: [],
    invalid_state: [],
    invalid_city_record: [],
    station_label_only: [],
    cross_country_duplicate: [],
    invalid_coordinates: []
  }
};

function sanitizeHierarchy() {
  console.log('\n🧹 Sanitizing hierarchy for staging...\n');

  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const diagnosticsPath = outputPath.replace(/\.json$/, '.diagnostics.json');
  const output = {
    metadata: {
      generated: new Date().toISOString(),
      source: 'aqi_coverage_map.json (sanitized)',
      sanitization_applied: true,
      normalization_rules: [
        'strict_country_validation',
        'placeholder_state_normalization',
        'station_label_sanitization',
        'coordinate_validation',
        'within_state_deduplication'
      ]
    },
    supported_countries: {}
  };

  const supportedCountries = input.supported_countries || {};
  const cityOccurrenceMap = new Map();

  function addExample(bucket, example, limit = 5) {
    if (bucket.length < limit) {
      bucket.push(example);
    }
  }

  function normalizeStateName(stateName) {
    const trimmed = String(stateName || '').trim();
    if (!trimmed) {
      return { name: null, is_placeholder: false };
    }

    if (/^unknown/i.test(trimmed) || /^general region$/i.test(trimmed)) {
      return { name: 'General Region', is_placeholder: true, source_state_name: trimmed };
    }

    return { name: trimmed, is_placeholder: false };
  }

  function getCoordinates(city) {
    const coordinates = city?.coordinates || {};
    const lat = coerceNumber(coordinates.latitude !== undefined ? coordinates.latitude : coordinates.lat);
    const lon = coerceNumber(coordinates.longitude !== undefined ? coordinates.longitude : coordinates.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }

    return { lat, lon };
  }

  for (const [countryKey, countryData] of Object.entries(supportedCountries)) {
    // Skip malformed country keys
    if (!countryKey || /^\d+$/.test(countryKey) || countryKey.length < 2) {
      stats.removed_by_rule.malformed_country_key++;
      addExample(stats.removed_examples.malformed_country_key, { country_key: countryKey });
      continue;
    }

    if (!countryData || typeof countryData !== 'object') {
      stats.removed_by_rule.invalid_country_shape++;
      continue;
    }

    const countryName = countryKey;
    stats.input_countries++;
    stats.retained_by_country[countryName] = {
      input_states: 0,
      retained_states: 0,
      input_cities: 0,
      retained_cities: 0,
      removed: {}
    };

    const sanitizedCountry = {
      iso2: countryData.iso2 || null,
      iso3: countryData.iso3 || null,
      regions: {},
      aqi_sources: countryData.aqi_sources || []
    };

    for (const [stateNameRaw, stateData] of Object.entries(countryData.regions || {})) {
      if (!stateData) continue;

      const stateDescriptor = normalizeStateName(stateNameRaw);
      const stateName = stateDescriptor.name;
      if (!stateName) {
        stats.removed_by_rule.invalid_state++;
        addExample(stats.removed_examples.invalid_state, { country: countryName, state_name: stateNameRaw });
        continue;
      }

      // Validate state
      const stateValidation = validateStateRecord({ name: stateName });
      if (!stateValidation.valid) {
        stats.removed_by_rule.invalid_state++;
        addExample(stats.removed_examples.invalid_state, { country: countryName, state_name: stateNameRaw, issues: stateValidation.issues });
        continue;
      }

      stats.input_states++;
      stats.retained_by_country[countryName].input_states++;

      const sanitizedState = {
        cities: [],
        sources: stateData.sources || [],
        region_type: stateDescriptor.is_placeholder
          ? 'synthetic_fallback'
          : (stateData.region_type || 'unknown'),
        region_source: stateDescriptor.is_placeholder
          ? 'placeholder_normalization'
          : (stateData.region_source || null),
        synthetic: stateDescriptor.is_placeholder || stateData.synthetic === true
      };

      if (stateDescriptor.is_placeholder) {
        sanitizedState.is_placeholder_state = true;
        sanitizedState.source_state_name = stateDescriptor.source_state_name;
      }

      const cityCanonicalKeys = new Set();

      for (const city of (stateData.cities || [])) {
        if (!city || !city.name) {
          stats.removed_by_rule.invalid_city_record++;
          addExample(stats.removed_examples.invalid_city_record, { country: countryName, state: stateNameRaw, city });
          continue;
        }

        const coordinates = getCoordinates(city);
        if (!coordinates) {
          stats.removed_by_rule.invalid_coordinates++;
          addExample(stats.removed_examples.invalid_coordinates, { country: countryName, state: stateNameRaw, city_name: city.name, coordinates: city.coordinates });
          continue;
        }

        stats.input_cities++;
        stats.retained_by_country[countryName].input_cities++;

        // Normalize city label
        const normalized = normalizeCityLabel(city.name);

        // Remove obvious station labels and agency-marked monitoring sites
        if (normalized.is_station_label) {
          stats.removed_by_rule.station_label_only++;
          addExample(stats.removed_examples.station_label_only, {
            country: countryName,
            state: stateNameRaw,
            raw_label: normalized.raw_label,
            display_name: normalized.display_name
          });
          continue;
        }

        // Generate canonical key for deduplication
        const canonicalKey = generateCanonicalCityKey(
          normalized.display_name,
          countryName,
          coordinates.lat,
          coordinates.lon
        );

        if (!canonicalKey) {
          stats.removed_by_rule.invalid_city_record++;
          addExample(stats.removed_examples.invalid_city_record, { country: countryName, state: stateNameRaw, city_name: city.name, reason: 'missing_canonical_key' });
          continue;
        }

        // Skip if already seen in this state (deduplicate within state)
        if (cityCanonicalKeys.has(canonicalKey)) {
          stats.removed_by_rule.cross_country_duplicate++;
          addExample(stats.removed_examples.cross_country_duplicate, {
            country: countryName,
            state: stateNameRaw,
            city_name: normalized.display_name,
            coordinates
          });
          continue;
        }

        cityCanonicalKeys.add(canonicalKey);

        // Add sanitized city with normalized coordinate format
        sanitizedState.cities.push({
          name: normalized.display_name,
          raw_label: normalized.raw_label,
          is_station_label: normalized.is_station_label,
          coordinates: {
            latitude: coordinates.lat,
            longitude: coordinates.lon
          },
          measurements: city.measurements || 0,
          source: city.source || 'unknown'
        });

        stats.output_cities++;
        stats.retained_by_country[countryName].retained_cities++;
      }

      if (sanitizedState.cities.length > 0) {
        sanitizedCountry.regions[stateName] = sanitizedState;
        stats.output_states++;
        stats.retained_by_country[countryName].retained_states++;
        if (stateDescriptor.is_placeholder) {
          stats.removed_by_rule.placeholder_state_normalized++;
        }
      }
    }

    if (Object.keys(sanitizedCountry.regions).length > 0) {
      output.supported_countries[countryName] = sanitizedCountry;
      stats.output_countries++;
    }
  }

  // Validate output
  const validation = validateHierarchyQuality(output);

  // Write output
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  fs.writeFileSync(diagnosticsPath, JSON.stringify({ stats, validation, generated: new Date().toISOString() }, null, 2));

  // Print report
  console.log('✅ Sanitization complete!\n');
  console.log('📊 Statistics:');
  console.log(`  Input:  ${stats.input_countries} countries, ${stats.input_states} states, ${stats.input_cities} cities`);
  console.log(`  Output: ${stats.output_countries} countries, ${stats.output_states} states, ${stats.output_cities} cities\n`);

  console.log('🗑️  Rule Counts:');
  for (const [rule, count] of Object.entries(stats.removed_by_rule)) {
    if (count > 0) {
      console.log(`  ${rule}: ${count}`);
    }
  }

  console.log('\n📍 Retained by country:');
  Object.entries(stats.retained_by_country)
    .sort((a, b) => b[1].retained_cities - a[1].retained_cities)
    .slice(0, 15)
    .forEach(([country, counts]) => {
      console.log(`  ${country}: ${counts.retained_states} states, ${counts.retained_cities} cities`);
    });

  console.log('\n✨ Quality Validation:');
  console.log(`  Passes: ${validation.passes ? '✅' : '❌'}`);
  console.log(`  Unknown regions: ${validation.report.issues.unknown_regions}`);
  console.log(`  Station-label cities: ${validation.report.issues.station_label_cities}`);
  console.log(`  Cross-country leaks detected: ${validation.report.issues.cross_country_leaks.length}`);

  if (validation.report.issues.cross_country_leaks.length > 0) {
    console.log('\n  ⚠️  Top cross-country leaks:');
    validation.report.issues.cross_country_leaks.slice(0, 5).forEach(leak => {
      console.log(`    - "${leak.city_name}": ${leak.country_count} countries`);
    });
  }

  console.log(`\n📁 Sanitized artifact: ${outputPath}`);
  console.log(`📁 Diagnostics artifact: ${diagnosticsPath}\n`);

  return { output, stats, validation, diagnosticsPath };
}

// Main
if (require.main === module) {
  try {
    const result = sanitizeHierarchy();
    process.exit(result.validation.passes ? 0 : 1);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

module.exports = { sanitizeHierarchy };
