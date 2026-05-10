# Post-Staging Validation Report

**Date:** 2026-05-10
**Scope:** Staging-only validation for hierarchical AQI migration and endpoints
**Status:** Staging validation complete; production rollout paused

## 1. Migration Execution Summary

The staging migration was executed with the guarded command:

```bash
node apply_hierarchy_migration_and_populate.js --apply --target=staging
```

Outcome:
- Migration SQL applied successfully in staging.
- Hierarchy tables were populated from the coverage map.
- Hierarchy cache entries were generated successfully.
- Production Neon was not modified.

A first staging attempt failed on an `iso2 CHAR(2)` constraint during population. That issue was corrected by widening `iso2` to `VARCHAR(5)` in the migration schema, after which the staging run completed successfully.

## 2. Hierarchy Table Population Status

Final staging counts:
- `aqi_countries`: 40 rows
- `aqi_states`: 40 rows
- `aqi_cities`: 14920 rows
- `aqi_hierarchy_cache`: 40 rows

Status:
- Countries populated successfully.
- State coverage populated successfully.
- City-level hierarchy coverage populated successfully.
- Cache rows created for every country row.

## 3. Cache Generation Results

Cache generation completed during the staging migration run.

Observed results:
- Cache table populated: 40/40 countries
- Cache payload type: JSON object
- Cache rows were created with valid `hierarchy_json` content
- Cache generation matched country count exactly

## 4. 29-Test Verification Results

The hierarchy verification suite passed in full against the staging server.

Result:
- Passed: 29
- Failed: 0
- Pass rate: 100%

Verified areas included:
- Countries endpoint behavior
- States endpoint behavior
- Cities endpoint behavior
- Search endpoint behavior
- Validate endpoint behavior
- Isolation and backward compatibility

## 5. Endpoint Compatibility Verification

Compatibility checks passed for existing endpoints while hierarchy routes were active.

Verified endpoints:
- `/api/locations`
- `/api/locations/summary`
- `/api/sources`
- `/api/hybrid-measurements`

Result:
- Existing endpoints continued to respond normally.
- No regression was observed in the staging validation pass.

## 6. Rollback Verification Status

Rollback was exercised during staging recovery after the initial failed migration attempt.

Status:
- Rollback procedure executed successfully.
- Partial hierarchy tables were dropped cleanly.
- Staging was restored before the corrected rerun.
- This confirmed the rollback path is usable for staging recovery.

## 7. Render Compatibility Confirmation

Render compatibility remains confirmed at the server level.

Observed state:
- The server started successfully with the hierarchy router mounted.
- The server read the database configuration correctly.
- Existing startup and initialization paths completed without hierarchy-related boot failures.

Current limitation:
- Full Render deployment was not exercised here.
- This report confirms staging server startup compatibility, not a live Render deploy.

## 8. Staging Environment Health Summary

Staging environment status after validation:
- Server startup: healthy
- Database connectivity: healthy
- Hierarchy routes: healthy
- Cache generation: healthy
- Existing endpoint compatibility: healthy
- Production safety: preserved

Overall assessment:
- Staging validation succeeded.
- The hierarchy backend is ready for sign-off review.
- Production rollout should stay paused until this report and the coverage review are approved.

## 9. 40-Country Staging Dataset Coverage Review

### Supported Countries
The staging dataset contains 40 country entries:
- `0`
- `1`
- `2`
- Indonesia
- Malaysia
- Chile
- Peru
- Argentina
- Dhekelia
- Cyprus
- India
- China
- Israel
- Palestine
- Lebanon
- Ethiopia
- South Sudan
- Kenya
- Malawi
- France
- Guyana
- Republic of Korea
- Morocco
- Costa Rica
- Nicaragua
- Democratic Republic of the Congo
- Bhutan
- Ukraine
- South Africa
- Saint-Martin
- Oman
- Uzbekistan
- Kazakhstan
- Japan
- United States
- United Kingdom
- Brazil
- United Arab Emirates
- Egypt
- Australia

### Region/State Coverage Quality
- Most countries have single-region coverage with `unknown_region` style grouping.
- Several high-coverage countries have richer hierarchy depth and multiple state-level groupings.
- State coverage is broad enough to support hierarchical navigation, but it is uneven across countries.
- Some countries appear as representative-region groupings rather than fully normalized administrative hierarchies.

### City Coverage Quality
- City coverage is strong overall, with 14,920 city rows in staging.
- OpenAQ-driven countries typically carry large city sets, often around 500 cities per country entry.
- Some countries have a small number of city records from OpenWeather fallback coverage.
- City data is sufficient for pagination and search verification, but not uniformly normalized across all countries.

### Unsupported or Partial-Coverage Regions
- No country is completely unsupported in the final staging dataset.
- Partial coverage still exists in practice for countries that rely on representative regions or a single fallback source.
- The dataset includes three malformed numeric country labels (`0`, `1`, `2`), which should be treated as data-quality artifacts rather than real countries.

### AQI Source Availability Observations
- OpenAQ is the dominant source across the dataset.
- OpenWeather contributes fallback coverage for a small number of countries.
- WAQI coverage exists but is sparse relative to OpenAQ.
- Many countries are effectively single-source coverage, so source diversity is uneven.
- Cache and API responses should continue to expose source metadata so the frontend can distinguish full and partial coverage later.

## 10. Recommendation

- Keep frontend hierarchy implementation paused.
- Keep production rollout paused until this report and the coverage review are accepted.
- Remove or sanitize the three malformed numeric country entries before any production promotion.
- Use the current staging results as the approval baseline for the next sign-off step.
