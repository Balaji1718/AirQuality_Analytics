/**
 * Debug Sanitization Pipeline
 * 
 * Adds detailed logging to identify which filtering rules remove data
 * Run: node debug_sanitization.js
 */

const fs = require('fs');
const path = require('path');
const { normalizeCityLabel, generateCanonicalCityKey, validateStateRecord } = require('./hierarchy_normalization_rules');

const inputPath = path.join(__dirname, 'aqi_coverage_map.json');

const stats = {
  countries: { input: 0, output: 0, removed: 0 },
  states: { input: 0, output: 0, removed: 0 },
  cities: { input: 0, output: 0, removed_by_stage: {} }
};

const removedByStage = {
  malformed_country_key: [],
  unknown_region: [],
  invalid_state: [],
  no_cities: [],
  city_missing_name: [],
  city_invalid_coords: [],
  city_station_label_filter: [],
  city_canonical_null: [],
  city_duplicate: []
};

console.log('\n🔍 DEBUG SANITIZATION PIPELINE\n');

if (!fs.existsSync(inputPath)) {
  console.error(`❌ Input file not found: ${inputPath}`);
  process.exit(1);
}

console.log(`📖 Reading: ${inputPath}\n`);
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const supportedCountries = input.supported_countries || {};

console.log(`📊 INPUT STRUCTURE:`);
console.log(`  supported_countries keys: ${Object.keys(supportedCountries).length}`);
console.log(`  First 5 keys: ${Object.keys(supportedCountries).slice(0, 5).join(', ')}\n`);

// Sample first country
const firstCountry = Object.entries(supportedCountries)[0];
if (firstCountry) {
  const [countryKey, countryData] = firstCountry;
  console.log(`📍 Sample Country (${countryKey}):`);
  console.log(`  Regions: ${countryData.regions ? Object.keys(countryData.regions).length : 0}`);
  
  const firstRegion = countryData.regions ? Object.entries(countryData.regions)[0] : null;
  if (firstRegion) {
    const [regionName, regionData] = firstRegion;
    console.log(`  Sample Region (${regionName}):`);
    console.log(`    Cities: ${regionData.cities ? regionData.cities.length : 0}`);
    if (regionData.cities && regionData.cities.length > 0) {
      const sampleCity = regionData.cities[0];
      console.log(`    Sample City: ${JSON.stringify(sampleCity).substring(0, 100)}...`);
    }
  }
}

console.log('\n' + '═'.repeat(80));
console.log('STAGE 1: Processing Countries');
console.log('═'.repeat(80) + '\n');

let countryCount = 0;
let stateCount = 0;
let cityCount = 0;

for (const [countryKey, countryData] of Object.entries(supportedCountries)) {
  // Skip malformed country keys
  if (!countryKey || /^\d+$/.test(countryKey) || countryKey.length < 2) {
    removedByStage.malformed_country_key.push({ key: countryKey, reason: 'malformed_format' });
    stats.countries.removed++;
    continue;
  }

  if (!countryData || typeof countryData !== 'object') {
    removedByStage.malformed_country_key.push({ key: countryKey, reason: 'invalid_data' });
    stats.countries.removed++;
    continue;
  }

  stats.countries.input++;
  const countryName = countryKey;

  console.log(`\n🌍 Country: ${countryName}`);
  console.log(`   Regions: ${Object.keys(countryData.regions || {}).length}`);

  let countryStateCount = 0;
  let countryCityCount = 0;

  for (const [stateName, stateData] of Object.entries(countryData.regions || {})) {
    if (!stateData) continue;

    // Skip unknown_region states
    if (/^unknown/i.test(stateName)) {
      removedByStage.unknown_region.push({ country: countryName, state: stateName });
      stats.states.removed++;
      continue;
    }

    // Validate state
    const stateValidation = validateStateRecord({ name: stateName });
    if (!stateValidation.valid) {
      removedByStage.invalid_state.push({ country: countryName, state: stateName, issues: stateValidation.issues });
      stats.states.removed++;
      continue;
    }

    stats.states.input++;
    countryStateCount++;

    console.log(`   📍 State: ${stateName}`);
    console.log(`      Cities: ${(stateData.cities || []).length}`);

    if (!stateData.cities || stateData.cities.length === 0) {
      removedByStage.no_cities.push({ country: countryName, state: stateName });
      continue;
    }

    let stateCityCount = 0;
    const cityCanonicalKeys = new Set();

    for (const city of stateData.cities) {
      stats.cities.input++;

      // Check for missing name
      if (!city || !city.name) {
        removedByStage.city_missing_name.push({ country: countryName, state: stateName, city: city });
        continue;
      }

      // Check coordinates - support both formats (latitude/longitude and lat/lon)
      if (!city.coordinates) {
        removedByStage.city_invalid_coords.push({ 
          country: countryName, 
          state: stateName, 
          city: city.name,
          coords: city.coordinates 
        });
        continue;
      }

      const lat = city.coordinates.latitude !== undefined ? city.coordinates.latitude : city.coordinates.lat;
      const lon = city.coordinates.longitude !== undefined ? city.coordinates.longitude : city.coordinates.lon;

      if (typeof lat !== 'number' || typeof lon !== 'number') {
        removedByStage.city_invalid_coords.push({ 
          country: countryName, 
          state: stateName, 
          city: city.name,
          coords: city.coordinates 
        });
        continue;
      }

      // Normalize city label
      const normalized = normalizeCityLabel(city.name);

      // Station label filter
      if (normalized.is_station_label && normalized.display_name.length < 3) {
        removedByStage.city_station_label_filter.push({
          country: countryName,
          state: stateName,
          raw: city.name,
          normalized: normalized.display_name,
          length: normalized.display_name.length
        });
        continue;
      }

      // Generate canonical key
      const canonicalKey = generateCanonicalCityKey(
        normalized.display_name,
        countryName,
        city.coordinates.latitude,
        city.coordinates.longitude
      );

      if (!canonicalKey) {
        removedByStage.city_canonical_null.push({
          country: countryName,
          state: stateName,
          city: city.name,
          normalized_display: normalized.display_name
        });
        continue;
      }

      // Dedup check
      if (cityCanonicalKeys.has(canonicalKey)) {
        removedByStage.city_duplicate.push({
          country: countryName,
          state: stateName,
          city: normalized.display_name
        });
        continue;
      }

      cityCanonicalKeys.add(canonicalKey);
      stateCityCount++;
      countryCityCount++;
      stats.cities.output++;
    }

    console.log(`         ✅ Kept: ${stateCityCount} cities`);
  }

  console.log(`   📊 Country summary: ${countryStateCount} states, ${countryCityCount} cities`);

  if (countryStateCount > 0) {
    stats.countries.output++;
    stats.states.output += countryStateCount;
  }
}

console.log('\n' + '═'.repeat(80));
console.log('SUMMARY');
console.log('═'.repeat(80));

console.log('\n📊 COUNTS:');
console.log(`  Countries: ${stats.countries.input} input → ${stats.countries.output} output (removed: ${stats.countries.removed})`);
console.log(`  States: ${stats.states.input} input → ${stats.states.output} output (removed: ${stats.states.removed})`);
console.log(`  Cities: ${stats.cities.input} input → ${stats.cities.output} output`);

console.log('\n🗑️  REMOVAL BREAKDOWN:');
for (const [stage, items] of Object.entries(removedByStage)) {
  if (items.length > 0) {
    console.log(`  ${stage}: ${items.length}`);
  }
}

console.log('\n' + '═'.repeat(80));
console.log('DETAILED REMOVAL ANALYSIS');
console.log('═'.repeat(80));

if (removedByStage.city_station_label_filter.length > 0) {
  console.log(`\n🔴 STATION LABEL FILTER (${removedByStage.city_station_label_filter.length} removed):`);
  console.log('   Top 10 examples:');
  removedByStage.city_station_label_filter.slice(0, 10).forEach((item, idx) => {
    console.log(`   ${idx + 1}. "${item.raw}" → "${item.normalized}" (len: ${item.length}) [${item.state}]`);
  });
}

if (removedByStage.city_canonical_null.length > 0) {
  console.log(`\n🔴 CANONICAL KEY NULL (${removedByStage.city_canonical_null.length} removed):`);
  console.log('   Top 10 examples:');
  removedByStage.city_canonical_null.slice(0, 10).forEach((item, idx) => {
    console.log(`   ${idx + 1}. City: "${item.city}" | Normalized: "${item.normalized_display}" | Country: ${item.country}`);
  });
}

if (removedByStage.city_invalid_coords.length > 0) {
  console.log(`\n🔴 INVALID COORDINATES (${removedByStage.city_invalid_coords.length} removed):`);
  console.log('   Top 10 examples:');
  removedByStage.city_invalid_coords.slice(0, 10).forEach((item, idx) => {
    console.log(`   ${idx + 1}. "${item.city}" | Coords: ${JSON.stringify(item.coords)}`);
  });
}

if (removedByStage.city_missing_name.length > 0) {
  console.log(`\n🔴 MISSING NAME (${removedByStage.city_missing_name.length} removed):`);
}

if (removedByStage.unknown_region.length > 0) {
  console.log(`\n🔴 UNKNOWN_REGION (${removedByStage.unknown_region.length} states removed):`);
  console.log('   Examples:');
  removedByStage.unknown_region.slice(0, 5).forEach((item, idx) => {
    console.log(`   ${idx + 1}. ${item.country} / ${item.state}`);
  });
}

console.log('\n' + '═'.repeat(80));
console.log(`✅ Debug analysis complete. Output saved.`);
console.log('═'.repeat(80) + '\n');
