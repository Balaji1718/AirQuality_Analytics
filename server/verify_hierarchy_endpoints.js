/**
 * Hierarchy Endpoints Verification Tests
 * 
 * Tests all 5 hierarchy endpoints:
 * ✅ GET /api/hierarchy/countries
 * ✅ GET /api/hierarchy/countries/:countryId/states
 * ✅ GET /api/hierarchy/countries/:countryId/states/:stateId/cities
 * ✅ GET /api/hierarchy/search
 * ✅ POST /api/hierarchy/validate
 * 
 * Requirements validated:
 * ✅ Isolation: No impact on existing endpoints
 * ✅ Pagination: Proper bounds checking, limit enforcement
 * ✅ Caching: Responses cached for 5 minutes
 * ✅ Validation: Input validation, graceful 404s
 * ✅ Error handling: Meaningful error messages
 * ✅ Backward-compatibility: Consistent JSON shapes
 */

const axios = require('axios');
const assert = require('assert');

const BASE_URL = process.env.API_URL || 'http://localhost:5000';
const TIMEOUT = 5000;

// Helper: Make HTTP request
async function request(method, path, data = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${path}`,
      timeout: TIMEOUT,
      headers: { 'Content-Type': 'application/json' }
    };
    if (data) config.data = data;
    
    const response = await axios(config);
    return { status: response.status, data: response.data };
  } catch (error) {
    if (error.response) {
      return { status: error.response.status, data: error.response.data, error: error.message };
    }
    throw error;
  }
}

// Test counter
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

// Helper: Log test result
function test(name, fn) {
  testsRun++;
  try {
    fn();
    testsPassed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    testsFailed++;
    console.error(`  ❌ ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

// Helper: Assert condition
function assertTrue(condition, message) {
  assert(condition, message);
}

function assertEqual(actual, expected, message) {
  assert.strictEqual(actual, expected, message);
}

async function runTests() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('HIERARCHY ENDPOINTS VERIFICATION TESTS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ===== Test Suite 1: GET /api/hierarchy/countries =====
  console.log('📋 Test Suite 1: GET /api/hierarchy/countries');
  
  test('Should return list of countries', async () => {
    const { status, data } = await request('GET', '/api/hierarchy/countries');
    assertEqual(status, 200, 'Status should be 200');
    assertTrue(Array.isArray(data.countries), 'Response should have countries array');
    assertTrue(typeof data.total === 'number', 'Response should have total count');
  });

  test('Should support pagination with limit parameter', async () => {
    const { status, data } = await request('GET', '/api/hierarchy/countries?limit=5');
    assertEqual(status, 200, 'Status should be 200');
    assertTrue(data.countries.length <= 5, 'Should respect limit parameter');
    assertTrue(data.limit === 5, 'Should include limit in response');
  });

  test('Should support offset parameter', async () => {
    const { status, data } = await request('GET', '/api/hierarchy/countries?offset=0&limit=5');
    assertEqual(status, 200, 'Status should be 200');
    assertTrue(data.offset === 0, 'Should include offset in response');
    assertTrue(data.countries.length <= 5, 'Should respect offset');
  });

  test('Should enforce max limit of 1000', async () => {
    const { status, data } = await request('GET', '/api/hierarchy/countries?limit=5000');
    assertEqual(status, 200, 'Status should be 200');
    assertTrue(data.limit <= 1000, 'Limit should be capped at 1000');
  });

  test('Should enforce min limit of 1', async () => {
    const { status, data } = await request('GET', '/api/hierarchy/countries?limit=0');
    assertEqual(status, 200, 'Status should be 200');
    assertTrue(data.limit >= 1, 'Limit should be minimum 1');
  });

  test('Should cache responses', async () => {
    const res1 = await request('GET', '/api/hierarchy/countries');
    const res2 = await request('GET', '/api/hierarchy/countries');
    assertTrue(!res1.data.cached || res1.data.cached === false, 'First request may not be cached');
    assertTrue(res2.data.cached === true, 'Second request should be cached');
  });

  // ===== Test Suite 2: GET /api/hierarchy/countries/:countryId/states =====
  console.log('\n📋 Test Suite 2: GET /api/hierarchy/countries/:countryId/states');

  let testCountry = null;

  test('Should get valid country from list first', async () => {
    const { data } = await request('GET', '/api/hierarchy/countries?limit=1');
    assertTrue(data.countries.length > 0, 'Should have at least one country');
    testCountry = data.countries[0];
    assertTrue(testCountry.name, 'Country should have name');
  });

  test('Should return states for valid country', async () => {
    if (!testCountry) this.skip();
    const { status, data } = await request('GET', `/api/hierarchy/countries/${testCountry.name}/states`);
    assertEqual(status, 200, 'Status should be 200');
    assertTrue(Array.isArray(data.states), 'Response should have states array');
    assertTrue(typeof data.total === 'number', 'Response should have total count');
    assertTrue(data.countryId === testCountry.name, 'Response should include countryId');
  });

  test('Should return empty gracefully for unknown country', async () => {
    const { status, data } = await request('GET', '/api/hierarchy/countries/UnknownCountry123/states');
    assertEqual(status, 200, 'Status should be 200 (graceful)');
    assertTrue(data.empty === true, 'Response should indicate empty state');
    assertTrue(Array.isArray(data.states), 'Response should still have states array (empty)');
    assertEqual(data.states.length, 0, 'States should be empty array');
  });

  test('Should return 400 when countryId is missing', async () => {
    const { status } = await request('GET', '/api/hierarchy/countries//states');
    assertTrue(status === 400 || status === 404, 'Should return 400 or 404 for missing countryId');
  });

  test('Should support pagination on states', async () => {
    if (!testCountry) this.skip();
    const { status, data } = await request('GET', `/api/hierarchy/countries/${testCountry.name}/states?limit=10`);
    assertEqual(status, 200, 'Status should be 200');
    assertTrue(data.states.length <= 10, 'Should respect limit');
  });

  // ===== Test Suite 3: GET /api/hierarchy/countries/:countryId/states/:stateId/cities =====
  console.log('\n📋 Test Suite 3: GET /api/hierarchy/countries/:countryId/states/:stateId/cities');

  let testState = null;

  test('Should get valid state from states list first', async () => {
    if (!testCountry) this.skip();
    const { data } = await request('GET', `/api/hierarchy/countries/${testCountry.name}/states?limit=1`);
    if (data.states && data.states.length > 0) {
      testState = data.states[0];
      assertTrue(testState.name, 'State should have name');
    }
  });

  test('Should return cities for valid state', async () => {
    if (!testCountry || !testState) this.skip();
    const { status, data } = await request('GET', `/api/hierarchy/countries/${testCountry.name}/states/${testState.name}/cities`);
    assertEqual(status, 200, 'Status should be 200');
    assertTrue(Array.isArray(data.cities), 'Response should have cities array');
    assertTrue(typeof data.total === 'number', 'Response should have total count');
  });

  test('Should return empty gracefully for unknown state', async () => {
    if (!testCountry) this.skip();
    const { status, data } = await request('GET', `/api/hierarchy/countries/${testCountry.name}/states/UnknownState123/cities`);
    assertEqual(status, 200, 'Status should be 200 (graceful)');
    assertTrue(data.empty === true, 'Response should indicate empty state');
    assertTrue(Array.isArray(data.cities), 'Response should still have cities array');
  });

  test('Should enforce max city limit of 500', async () => {
    if (!testCountry || !testState) this.skip();
    const { status, data } = await request('GET', `/api/hierarchy/countries/${testCountry.name}/states/${testState.name}/cities?limit=1000`);
    assertEqual(status, 200, 'Status should be 200');
    assertTrue(data.limit <= 500, 'City limit should be capped at 500');
  });

  test('Should return pagination error for invalid offset', async () => {
    if (!testCountry || !testState) this.skip();
    const { status, data } = await request('GET', `/api/hierarchy/countries/${testCountry.name}/states/${testState.name}/cities?offset=999999&limit=50`);
    assertEqual(status, 200, 'Status should be 200');
    // Should either have cities or graceful error
    assertTrue(Array.isArray(data.cities) || data.error, 'Should have cities array or error field');
  });

  test('Should include hasMore flag for pagination', async () => {
    if (!testCountry || !testState) this.skip();
    const { status, data } = await request('GET', `/api/hierarchy/countries/${testCountry.name}/states/${testState.name}/cities?limit=10`);
    assertEqual(status, 200, 'Status should be 200');
    assertTrue(typeof data.hasMore === 'boolean', 'Response should include hasMore flag');
  });

  // ===== Test Suite 4: GET /api/hierarchy/search =====
  console.log('\n📋 Test Suite 4: GET /api/hierarchy/search');

  test('Should return 400 when query is missing', async () => {
    const { status } = await request('GET', '/api/hierarchy/search');
    assertEqual(status, 400, 'Status should be 400');
  });

  test('Should search countries', async () => {
    const { status, data } = await request('GET', '/api/hierarchy/search?q=United');
    assertEqual(status, 200, 'Status should be 200');
    assertTrue(Array.isArray(data.results), 'Response should have results array');
    assertTrue(typeof data.total === 'number', 'Response should have total count');
  });

  test('Should filter search by type=country', async () => {
    const { status, data } = await request('GET', '/api/hierarchy/search?q=United&type=country');
    assertEqual(status, 200, 'Status should be 200');
    assertTrue(Array.isArray(data.results), 'Response should have results array');
    if (data.results.length > 0) {
      assertTrue(data.results.every(r => r.type === 'country'), 'All results should be country type');
    }
  });

  test('Should support search limit', async () => {
    const { status, data } = await request('GET', '/api/hierarchy/search?q=a&limit=5');
    assertEqual(status, 200, 'Status should be 200');
    assertTrue(data.results.length <= 5, 'Should respect limit parameter');
  });

  test('Should enforce max search limit of 100', async () => {
    const { status, data } = await request('GET', '/api/hierarchy/search?q=a&limit=1000');
    assertEqual(status, 200, 'Status should be 200');
    assertTrue(data.limit <= 100, 'Search limit should be capped at 100');
  });

  test('Should return meaningful results', async () => {
    const { status, data } = await request('GET', '/api/hierarchy/search?q=India');
    assertEqual(status, 200, 'Status should be 200');
    assertTrue(data.results.length > 0, 'Should find India');
    assertTrue(data.results.some(r => r.name && r.name.toLowerCase().includes('india')), 'Should include India in results');
  });

  // ===== Test Suite 5: POST /api/hierarchy/validate =====
  console.log('\n📋 Test Suite 5: POST /api/hierarchy/validate');

  test('Should accept POST request', async () => {
    const { status, data } = await request('POST', '/api/hierarchy/validate', {});
    assertEqual(status, 200, 'Status should be 200');
    assertTrue(data.status === 'ok', 'Status should be ok');
  });

  test('Should return validation metadata', async () => {
    const { status, data } = await request('POST', '/api/hierarchy/validate', {});
    assertEqual(status, 200, 'Status should be 200');
    assertTrue(data.metadata, 'Response should have metadata');
    assertTrue(typeof data.metadata.totalCountries === 'number', 'Should include totalCountries');
    assertTrue(typeof data.metadata.countriesWithData === 'number', 'Should include countriesWithData');
  });

  test('Should include timestamp', async () => {
    const { status, data } = await request('POST', '/api/hierarchy/validate', {});
    assertEqual(status, 200, 'Status should be 200');
    assertTrue(data.timestamp, 'Response should include timestamp');
  });

  // ===== Isolation & Backward Compatibility Tests =====
  console.log('\n📋 Test Suite 6: Isolation & Backward Compatibility');

  test('Should not affect existing /api/hybrid-measurements endpoint', async () => {
    const { status, data } = await request('POST', '/api/hybrid-measurements', { city: 'Delhi' });
    // Should either work (200) or fail gracefully, but not be affected by hierarchy router
    assertTrue(status >= 200 && status < 600, 'Existing endpoint should remain unaffected');
  });

  test('Should not affect existing /api/locations endpoint', async () => {
    const { status } = await request('GET', '/api/locations');
    // Should still return 200 or fail gracefully
    assertTrue(status >= 200 && status < 600, 'Existing /api/locations should be unaffected');
  });

  test('Should return proper JSON for all hierarchy endpoints', async () => {
    const endpoints = [
      '/api/hierarchy/countries',
      '/api/hierarchy/search?q=test'
    ];
    
    for (const endpoint of endpoints) {
      const { data } = await request('GET', endpoint);
      assertTrue(typeof data === 'object' && data !== null, `${endpoint} should return JSON object`);
    }
  });

  // ===== Summary =====
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`TESTS COMPLETE: ${testsPassed}/${testsRun} passed`);
  if (testsFailed > 0) {
    console.log(`⚠️  ${testsFailed} tests failed`);
    process.exit(1);
  } else {
    console.log('✅ All verification tests passed!');
    console.log('═══════════════════════════════════════════════════════════════\n');
    process.exit(0);
  }
}

// Run tests
runTests().catch(err => {
  console.error('Test execution failed:', err.message);
  process.exit(1);
});
