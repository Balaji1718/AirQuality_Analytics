# AQI Search and Hierarchy Stabilization Report

Generated: 2026-06-10

## Phase 1 - AQI Location Resolution Restoration

### Root Cause

- `/api/hybrid-measurements` was able to load AQI data, but the response did not consistently expose `resolvedLocation`, `resolvedCoordinates`, `providerLocation`, `stationMetadata`, or `searchContext` to the frontend.
- The frontend therefore fell back to raw user input for display in several empty/success states.
- Hierarchy context was not consistently used to build the provider query candidates, so country/state selections could collapse into broad/raw text searches.
- A duplicate legacy `fetchFromOpenWeather` definition overrode the validated implementation.
- Local provider configuration was loaded only from the repo root `.env`; this workspace keeps provider config under `server/.env`, which caused local validation to miss provider paths until fixed.

### Fix Summary

- Restored provider-backed resolution metadata in `server/index.js`.
- Added hierarchy-aware search context with best-match query candidates for local, state, and country searches.
- Preserved manual search fallback while preventing raw fuzzy input from winning over canonical provider geography.
- Replaced the stubbed `server/utils/locationValidator.js` with canonical/fuzzy Indian city matching, coordinate validation, and normalized metadata.
- Returned `resolvedLocation`, `resolvedCoordinates`, `providerLocation`, `stationMetadata`, and `searchContext` to the frontend.
- Updated `client/src/App.js` to display resolved/provider labels instead of raw input when provider metadata exists.
- Loaded `server/.env` in addition to any root `.env` so local provider-backed validation reflects runtime configuration.

### Before vs After Validation

Before:

- Raw inputs such as `Delh` could be displayed as the final location label.
- Provider/station metadata was not reliably visible to the UI.
- OpenWeather validation was bypassed by a later legacy function definition.
- Empty AQI responses did not carry enough resolution context for the frontend.

After:

| Search case | Request | Result |
| --- | --- | --- |
| Exact city | `{ city: "Delhi" }` | 3204 results, resolved `Delhi, India` |
| Imperfect city | `{ city: "Delh" }` | 3204 results, resolved `Delhi, India` |
| Country only | `{ country: "India" }` | 3780 results, resolved `India (representative regions)` |
| Country + state | `{ country: "India", state: "Karnataka" }` | 10 results, resolved `Bengaluru, Karnataka, India` |
| Hierarchy city | `{ city: "Bengaluru", country: "India", state: "Karnataka" }` | 3000 results, resolved `Bengaluru, Karnataka, India` |
| Missing place | `{ city: "XyzNotAPlace" }` | graceful empty payload with fallback resolution context |

Validation command:

```bash
node scripts/validate_hybrid_search.js
node scripts/validate_hybrid_search.cjs
```

Both entry points passed 6/6.

## Phase 2 - Hierarchy-Aware Autocomplete

### Fix Summary

- Manual search suggestions are now scoped from the current hierarchy state:
  - No hierarchy selected: global country suggestions.
  - Country selected: selected country plus states from that country.
  - Country + state selected: cities from that selected branch.
- City selection no longer clears the selected country/state context.
- Manual free-text search fallback remains unchanged.

### Validation Snapshot

```json
{
  "noHierarchySuggestions": ["Indonesia", "Malaysia", "Chile", "Peru", "Argentina"],
  "countrySelected": {
    "country": "India",
    "suggestions": ["India", "Delhi", "unknown_region"],
    "totalStates": 2
  },
  "countryAndStateSelected": {
    "country": "India",
    "state": "Delhi",
    "suggestions": ["Delhi"],
    "totalCities": 1
  }
}
```

`unknown_region` is a source hierarchy quality issue; scoping itself is working.

## Phase 3 - Validation Suite Audit

### Root Cause

- `server/verify_hierarchy_endpoints.js` launched async tests without awaiting them.
- Staging validation expected stale endpoints and payload shapes such as `/countries`, POST `/search`, and raw array responses.
- Hybrid AQI validation printed `OK` for responses without asserting `resolvedLocation`, `searchContext`, provider metadata, or fuzzy resolution quality.
- The `.cjs` and `.js` hybrid validators had drifted; the `.cjs` version still called stale endpoints.
- Hierarchy country/state cache keys ignored pagination, allowing cached full-list responses to pollute paginated validation.

### Fix Summary

- Awaited hierarchy endpoint tests and hardened dynamic country/state selection.
- Fixed hierarchy cache keys to include source mode, limit, and offset.
- Replaced staging validation with a contract validator for the current `/api/hierarchy/*` shape.
- Replaced hybrid validation with assertions for resolved labels, provider/station metadata, search context, fuzzy matching, and graceful empty fallback.
- Made the `.cjs` validator delegate to the maintained `.js` validator.

### Validation Results

| Suite | Result | Notes |
| --- | --- | --- |
| `node server/verify_hierarchy_endpoints.js` | 29/29 passed | hierarchy endpoint contract and isolation |
| `node server/validate_staging_hierarchy.js` | 11/11 passed | 1 warning for sampled `unknown_region` |
| `node scripts/validate_hybrid_search.js` | 6/6 passed | exact, fuzzy, hierarchy, country, empty fallback |
| `node scripts/validate_hybrid_search.cjs` | 6/6 passed | wrapper path works |
| `npm run build` in `client` | passed | React production build compiled |

## Phase 4 - Hierarchy Discovery Improvement

### Root Cause

- The OpenAQ discovery script used obsolete country filters (`country=`), which OpenAQ v3 ignores.
- As a result, multiple countries inherited the same Ghana stations and coordinates.
- Unknown provider regions were collapsed without preserving whether they were true administrative regions, provider locality labels, or synthetic fallback buckets.

### Fix Summary

- Updated discovery to load `server/.env`.
- Updated OpenAQ discovery to query `locations?countries_id=<country.id>`.
- Added defensive country-code validation so mismatched provider rows are rejected.
- Added region provenance:
  - `administrative`
  - `provider_locality`
  - `synthetic_fallback`
- Preserved that provenance through the staging sanitizer.
- Updated hierarchy analysis metrics to report cleaned administrative/provider-locality/synthetic region counts.

The live discovery job was not run in this pass to avoid overwriting `server/aqi_coverage_map.json` outside a controlled rebuild.

### Current Metrics From Existing Artifacts

Generated with:

```bash
node server/generate_real_hierarchy_coverage_analysis.js
```

- Federation countries: 193
- Cleaned effective countries: 37
- Cleaned states/regions: 40
- Cleaned cities: 12490
- Total real administrative regions: 7
- Total synthetic regions: 173
- Fallback-only countries: 173
- Hierarchy completeness score: 68.28
- Hierarchy authenticity score: 22.57
- Cross-country leak signatures in cleaned validation: 415

The new provenance counters will become meaningful after a controlled discovery + sanitize rebuild using the fixed OpenAQ filter.
