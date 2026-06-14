import axios from 'axios';
import assert from 'node:assert';

const API = process.env.API_BASE_URL || 'http://localhost:5000';
const client = axios.create({ baseURL: API, timeout: 30000 });

const tests = [
  {
    name: 'Manual exact city resolves provider-backed Delhi',
    body: { city: 'Delhi' },
    expectLocation: /delhi/i,
    expectCountry: /india/i,
    requireProviderMetadata: true,
  },
  {
    name: 'Manual fuzzy city resolves Delh to Delhi',
    body: { city: 'Delh' },
    expectLocation: /delhi/i,
    expectCountry: /india/i,
    rawMustNotWin: true,
    requireProviderMetadata: true,
  },
  {
    name: 'Country-only search returns country resolution',
    body: { country: 'India' },
    expectLocation: /india/i,
    expectLevel: 'country',
    requireProviderMetadata: true,
  },
  {
    name: 'Country + state search is scoped to Karnataka',
    body: { country: 'India', state: 'Karnataka' },
    expectLocation: /india|karnataka|bengaluru/i,
    expectCountry: /india/i,
    expectState: /karnataka/i,
    requireProviderMetadata: true,
  },
  {
    name: 'Hierarchy city selection preserves full hierarchy',
    body: { city: 'Bengaluru', country: 'India', state: 'Karnataka' },
    expectLocation: /bengaluru/i,
    expectCountry: /india/i,
    expectState: /karnataka/i,
    requireProviderMetadata: true,
  },
  {
    name: 'Nonexistent fuzzy search fails gracefully',
    body: { city: 'XyzNotAPlace' },
    expectEmpty: true,
  },
];

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function providerMetadataCount(payload) {
  const resultMetadata = Array.isArray(payload.results)
    ? payload.results.filter(result => result.providerLocation || result.stationMetadata).length
    : 0;

  return resultMetadata + (payload.providerLocation ? 1 : 0) + (payload.stationMetadata ? 1 : 0);
}

function assertResolvedPayload(testCase, payload) {
  assert(payload && typeof payload === 'object', 'Expected JSON object payload');

  if (testCase.expectEmpty) {
    const resultCount = Array.isArray(payload.results) ? payload.results.length : Number(payload.count || 0);
    assert(payload.empty === true || resultCount === 0, 'Expected graceful empty payload');
    assert(payload.resolvedLocation, 'Empty payload should still include resolvedLocation fallback');
    assert(payload.searchContext, 'Empty payload should still include searchContext');
    return;
  }

  assert(Array.isArray(payload.results), 'Expected results array');
  assert(payload.results.length > 0, 'Expected at least one result');
  assert(payload.resolvedLocation, 'Expected resolvedLocation');
  assert(payload.searchContext && typeof payload.searchContext === 'object', 'Expected searchContext object');

  if (testCase.expectLocation) {
    assert(
      testCase.expectLocation.test(payload.resolvedLocation),
      `resolvedLocation "${payload.resolvedLocation}" did not match ${testCase.expectLocation}`
    );
  }

  if (testCase.expectCountry) {
    const countryText = `${payload.searchContext.country || ''} ${payload.resolvedLocation || ''}`;
    assert(testCase.expectCountry.test(countryText), `Expected country to match ${testCase.expectCountry}`);
  }

  if (testCase.expectState) {
    const stateText = `${payload.searchContext.state || ''} ${payload.resolvedLocation || ''}`;
    assert(testCase.expectState.test(stateText), `Expected state to match ${testCase.expectState}`);
  }

  if (testCase.expectLevel) {
    assert.strictEqual(payload.searchContext.level, testCase.expectLevel, `Expected search level ${testCase.expectLevel}`);
  }

  if (testCase.rawMustNotWin) {
    assert.notStrictEqual(
      normalize(payload.resolvedLocation),
      normalize(testCase.body.city),
      'Raw misspelled input should not become the final resolved location'
    );
  }

  if (testCase.requireProviderMetadata) {
    assert(providerMetadataCount(payload) > 0, 'Expected providerLocation or stationMetadata to propagate');
  }
}

async function run() {
  console.log(`Validation: hybrid measurements tests against ${API}`);

  const results = [];
  for (const testCase of tests) {
    try {
      process.stdout.write(`- ${testCase.name}... `);
      const res = await client.post('/api/hybrid-measurements', testCase.body);
      assert.strictEqual(res.status, 200, 'Expected HTTP 200');
      assertResolvedPayload(testCase, res.data);
      const count = Array.isArray(res.data.results) ? res.data.results.length : Number(res.data.count || 0);
      console.log(`PASS (${count} results, resolved: ${res.data.resolvedLocation})`);
      results.push({ pass: true, name: testCase.name });
    } catch (err) {
      const message = err.response?.data?.error || err.stack || err.message;
      console.log(`FAIL (${message})`);
      results.push({ pass: false, name: testCase.name, error: message });
    }
  }

  const failures = results.filter(result => !result.pass);
  console.log(`\nHybrid validation summary: ${results.length - failures.length}/${results.length} passed`);

  if (failures.length > 0) {
    failures.forEach(failure => console.log(`- ${failure.name}: ${failure.error}`));
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
