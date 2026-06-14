/**
 * Staging Hierarchy Validation Suite
 *
 * Validates the runtime hierarchy API contract and reports data-quality warnings.
 *
 * Run:
 *   node server/validate_staging_hierarchy.js
 *   node server/validate_staging_hierarchy.js --api-url=http://localhost:5000/api/hierarchy
 *   node server/validate_staging_hierarchy.js --strict-data-quality
 */

const axios = require('axios');
const assert = require('assert');

function parseArgs(argv) {
  const parsed = {
    apiUrl: 'http://localhost:5000/api/hierarchy',
    strictDataQuality: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--api-url=')) {
      parsed.apiUrl = arg.slice('--api-url='.length) || parsed.apiUrl;
    }
    if (arg === '--strict-data-quality') {
      parsed.strictDataQuality = true;
    }
  }

  parsed.apiUrl = parsed.apiUrl.replace(/\/$/, '');
  return parsed;
}

function pathSegment(value) {
  return encodeURIComponent(String(value));
}

async function test(name, fn) {
  try {
    const detail = await fn();
    console.log(`  PASS ${name}${detail ? ` - ${detail}` : ''}`);
    return { pass: true, name, detail };
  } catch (err) {
    console.log(`  FAIL ${name}`);
    console.log(`       ${err.message}`);
    return { pass: false, name, error: err.message };
  }
}

function warn(warnings, message) {
  warnings.push(message);
  console.log(`  WARN ${message}`);
}

function assertObject(value, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} should be an object`);
}

async function runValidation() {
  const { apiUrl, strictDataQuality } = parseArgs(process.argv.slice(2));
  const client = axios.create({ baseURL: apiUrl, timeout: 15000 });

  console.log('\nStaging Hierarchy Validation Suite');
  console.log(`Target API: ${apiUrl}`);
  console.log(`Strict data quality: ${strictDataQuality ? 'on' : 'off'}\n`);

  const tests = [];
  const warnings = [];
  let countries = [];
  let selectedCountry = null;
  let selectedState = null;
  let selectedCities = [];

  tests.push(await test('GET /countries returns current object shape', async () => {
    const res = await client.get('/countries?limit=20&offset=0');
    assert.strictEqual(res.status, 200, 'Expected HTTP 200');
    assertObject(res.data, 'countries response');
    assert(Array.isArray(res.data.countries), 'Expected countries array');
    assert(typeof res.data.total === 'number', 'Expected numeric total');
    assert.strictEqual(res.data.limit, 20, 'Expected echoed limit');
    assert.strictEqual(res.data.offset, 0, 'Expected echoed offset');
    assert(res.data.countries.length > 0, 'Expected at least one country');
    countries = res.data.countries;
    return `${res.data.countries.length}/${res.data.total} countries`;
  }));

  tests.push(await test('Country records expose stable fields', async () => {
    assert(countries.length > 0, 'No countries loaded');
    const country = countries[0];
    assert(country.id, 'Missing country.id');
    assert(country.name, 'Missing country.name');
    assert(typeof country.regions === 'number' || typeof country.cities === 'number', 'Missing region/city count');
  }));

  tests.push(await test('Country pagination is scoped per request', async () => {
    const first = await client.get('/countries?limit=5&offset=0');
    const second = await client.get('/countries?limit=5&offset=5');
    assert(first.data.countries.length <= 5, 'First page ignored limit');
    assert(second.data.countries.length <= 5, 'Second page ignored limit');
    assert.strictEqual(first.data.limit, 5, 'First page missing limit');
    assert.strictEqual(second.data.limit, 5, 'Second page missing limit');
    assert.strictEqual(second.data.offset, 5, 'Second page missing offset');
  }));

  tests.push(await test('Can select a country with states', async () => {
    const all = await client.get('/countries?limit=1000&offset=0');
    assert(Array.isArray(all.data.countries), 'Expected countries array');

    for (const country of all.data.countries) {
      const statesRes = await client.get(`/countries/${pathSegment(country.name)}/states?limit=10&offset=0`);
      if (Array.isArray(statesRes.data.states) && statesRes.data.states.length > 0) {
        selectedCountry = country;
        break;
      }
    }

    assert(selectedCountry, 'No country with states found');
    return selectedCountry.name;
  }));

  tests.push(await test('GET /countries/:country/states returns current object shape', async () => {
    assert(selectedCountry, 'No selected country');
    const res = await client.get(`/countries/${pathSegment(selectedCountry.name)}/states?limit=25&offset=0`);
    assert.strictEqual(res.status, 200, 'Expected HTTP 200');
    assertObject(res.data, 'states response');
    assert(Array.isArray(res.data.states), 'Expected states array');
    assert(typeof res.data.total === 'number', 'Expected numeric total');
    assert.strictEqual(res.data.limit, 25, 'Expected echoed limit');
    assert.strictEqual(res.data.offset, 0, 'Expected echoed offset');
    assert(res.data.states.length > 0, 'Expected at least one state');

    selectedState = res.data.states.find(state => state.cities > 0) || res.data.states[0];
    assert(selectedState.id, 'Missing state.id');
    assert(selectedState.name, 'Missing state.name');
    assert(typeof selectedState.cities === 'number', 'Missing state.cities');
    return `${res.data.states.length}/${res.data.total} states for ${selectedCountry.name}`;
  }));

  tests.push(await test('State pagination is scoped per request', async () => {
    assert(selectedCountry, 'No selected country');
    const res = await client.get(`/countries/${pathSegment(selectedCountry.name)}/states?limit=1&offset=0`);
    assert(res.data.states.length <= 1, 'States endpoint ignored limit');
    assert.strictEqual(res.data.limit, 1, 'States endpoint missing limit');
    assert.strictEqual(res.data.offset, 0, 'States endpoint missing offset');
  }));

  tests.push(await test('GET /countries/:country/states/:state/cities returns current object shape', async () => {
    assert(selectedCountry && selectedState, 'No selected country/state');
    const res = await client.get(
      `/countries/${pathSegment(selectedCountry.name)}/states/${pathSegment(selectedState.name)}/cities?limit=50&offset=0`
    );
    assert.strictEqual(res.status, 200, 'Expected HTTP 200');
    assertObject(res.data, 'cities response');
    assert(Array.isArray(res.data.cities), 'Expected cities array');
    assert(typeof res.data.total === 'number', 'Expected numeric total');
    assert.strictEqual(res.data.limit, 50, 'Expected echoed limit');
    assert.strictEqual(res.data.offset, 0, 'Expected echoed offset');
    assert(typeof res.data.hasMore === 'boolean', 'Expected hasMore boolean');
    assert(res.data.cities.length > 0, 'Expected at least one city');

    selectedCities = res.data.cities;
    const city = selectedCities[0];
    assert(city.id, 'Missing city.id');
    assert(city.name, 'Missing city.name');
    if (city.coordinates) {
      assert(typeof city.coordinates.latitude === 'number', 'Invalid city latitude');
      assert(typeof city.coordinates.longitude === 'number', 'Invalid city longitude');
    }
    return `${res.data.cities.length}/${res.data.total} cities for ${selectedState.name}`;
  }));

  tests.push(await test('GET /search uses GET query contract', async () => {
    const res = await client.get('/search?q=Delhi&type=city&limit=10');
    assert.strictEqual(res.status, 200, 'Expected HTTP 200');
    assertObject(res.data, 'search response');
    assert(Array.isArray(res.data.results), 'Expected results array');
    assert(typeof res.data.total === 'number', 'Expected numeric total');
    assert.strictEqual(res.data.query, 'Delhi', 'Expected echoed query');
    assert.strictEqual(res.data.limit, 10, 'Expected echoed limit');
    assert(res.data.results.length > 0, 'Expected Delhi search results');

    const result = res.data.results[0];
    assert(result.type, 'Missing result.type');
    assert(result.name, 'Missing result.name');
    assert(result.path, 'Missing result.path');
  }));

  tests.push(await test('GET /search rejects missing query', async () => {
    try {
      await client.get('/search');
      throw new Error('Expected HTTP 400');
    } catch (err) {
      assert.strictEqual(err.response?.status, 400, 'Expected HTTP 400 for missing query');
    }
  }));

  tests.push(await test('POST /validate returns validation metadata', async () => {
    const res = await client.post('/validate', {});
    assert.strictEqual(res.status, 200, 'Expected HTTP 200');
    assert.strictEqual(res.data.status, 'ok', 'Expected status ok');
    assert(res.data.timestamp, 'Missing timestamp');
    assertObject(res.data.metadata, 'metadata');
    assert(typeof res.data.metadata.totalCountries === 'number', 'Missing totalCountries');
    assert(typeof res.data.metadata.totalStates === 'number', 'Missing totalStates');
    assert(typeof res.data.metadata.totalCities === 'number', 'Missing totalCities');
  }));

  tests.push(await test('Unknown hierarchy path returns graceful empty payload', async () => {
    const res = await client.get('/countries/DefinitelyMissingCountry/states');
    assert.strictEqual(res.status, 200, 'Expected graceful HTTP 200');
    assert.strictEqual(res.data.empty, true, 'Expected empty=true');
    assert(Array.isArray(res.data.states), 'Expected states array');
    assert.strictEqual(res.data.states.length, 0, 'Expected no states');
  }));

  console.log('\nData quality observations:\n');
  if (countries.some(country => /^unknown/i.test(country.name))) {
    warn(warnings, 'Unknown-looking country names are present');
  }

  if (selectedState && /^unknown/i.test(selectedState.name)) {
    warn(warnings, `Selected state is a fallback/synthetic region: ${selectedState.name}`);
  }

  const stationLabelCities = selectedCities.filter(city =>
    /^(DPCC|CPCB|WAQI|EPA|NMA)$/i.test(city.name) || /^(R K Puram|Lajpat Nagar)$/i.test(city.name)
  );
  if (stationLabelCities.length > 0) {
    warn(warnings, `${stationLabelCities.length} sampled cities look like station/agency labels`);
  }

  const coordinateWarnings = selectedCities.filter(city => {
    if (!city.coordinates) return false;
    const lat = city.coordinates.latitude;
    const lon = city.coordinates.longitude;
    return typeof lat !== 'number' || typeof lon !== 'number' || lat < -90 || lat > 90 || lon < -180 || lon > 180;
  });
  if (coordinateWarnings.length > 0) {
    warn(warnings, `${coordinateWarnings.length} sampled cities have invalid coordinates`);
  }

  if (warnings.length === 0) {
    console.log('  No data-quality warnings in the sampled hierarchy.');
  }

  const failCount = tests.filter(result => !result.pass).length;
  const warningFailure = strictDataQuality && warnings.length > 0;

  console.log('\nValidation summary');
  console.log(`  Tests: ${tests.length}`);
  console.log(`  Passed: ${tests.length - failCount}`);
  console.log(`  Failed: ${failCount}`);
  console.log(`  Warnings: ${warnings.length}`);

  if (failCount > 0) {
    console.log('\nFailed tests:');
    tests.filter(result => !result.pass).forEach(result => {
      console.log(`  - ${result.name}: ${result.error}`);
    });
  }

  if (warningFailure) {
    console.log('\nStrict data quality is enabled, so warnings fail the run.');
  }

  process.exit(failCount > 0 || warningFailure ? 1 : 0);
}

runValidation().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
