# Before vs. After Behavior Comparison

This document highlights the behavioral differences, bugs fixed, and architectural improvements introduced with the Station-First Measurement Preservation refactoring.

---

## Side-by-Side Comparison

| Feature / Scenario | Before Refactor | After Refactor |
| :--- | :--- | :--- |
| **Multi-Station Search** (e.g. Delhi) | Collapsed multiple monitoring stations into a single averaged snapshot in `groupSnapshot()`. | Preserves all stations individually in the `stations[]` array. |
| **Snapshot Calculation** | Averaged pollutant measurements across physically distinct monitoring stations. | Isolates calculations to the primary station's results only, preventing cross-averaging. |
| **OpenAQ Suggestion Leak** | Falling back to representative suggestions (e.g., Delhi stations) when searching for "Bengaluru" or "Karnataka" resulted in data contamination due to missing validator checks. | OpenAQ suggestions are run through strict location validation, rejecting mismatched canonical cities. |
| **WAQI Search Resolution** | Forced immediate, single-station geocoding or direct feed lookups without keyword-based station lists. | Discovers up to 5 matching stations via `/search/?keyword=...` and resolves detailed feeds in parallel. |
| **OpenWeather Query Path** | Appended `/air_pollution` to a base URL that already contained it, causing constant 404 API failures. | Corrected the URL construction, allowing coordinates-based fallbacks to resolve correctly. |
| **API Response Structure** | Returned only top-level legacy fields with averaged/polluted values. | Returns top-level legacy fields (mapped to the highest-confidence primary station) AND the new `stations[]` array. |

---

## Detailed Bug Fixes

### 1. Multi-Station Snapshot Averaging
- **Bug**: If a city query (like "Delhi") returned data from 5 different stations, the legacy code mixed them all together to compute averages for PM2.5, PM10, etc. This resulted in an artificially blended value that didn't represent any physical location.
- **Fix**: The code now groups results by station and passes only the primary station's measurements to the snapshot function for legacy backward-compatible display. Individual station snapshots are also pre-calculated and exposed in the `stations[]` array.

### 2. OpenAQ Suggestion Contamination
- **Bug**: OpenAQ has a fallback where, if a query yields no direct matches, it returns representative stations from major cities (e.g. Delhi). Since there was no location match validation on OpenAQ results, searches for "Bengaluru" or "Karnataka" would display Delhi Technological University data as the actual reading.
- **Fix**: Implemented strict validation checks using `validateLocationMatch`. If the requested city is Bengaluru/Karnataka but the provider returns a Delhi station, the validator flags a `city_mismatch_known_cities` error and rejects the location.

### 3. OpenWeather 404 Failures
- **Bug**: The OpenWeather base URL in `API_SOURCES` was defined as `https://api.openweathermap.org/data/2.5/air_pollution`. The geocoding fallback constructed queries by appending `/air_pollution`, resulting in `https://api.openweathermap.org/data/2.5/air_pollution/air_pollution`, which returned a 404.
- **Fix**: Removed the duplicate path segment in URL construction, restoring OpenWeather as a valid coordinate-based fallback source.

### 4. Database City Search Scope Pollution
- **Bug**: City search queries in the database used `OR LOWER(country) LIKE ...`, which meant a query for a city like "Delhi" matched all country rows, pulling in and averaging unrelated city data.
- **Fix**: Refactored the database search scoping to verify search levels strictly, separating country-level filters from city-level queries.
