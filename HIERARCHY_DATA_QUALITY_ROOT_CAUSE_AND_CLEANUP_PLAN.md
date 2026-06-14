# Hierarchy Data Quality: Root Cause and Safe Cleanup Plan

Date: 2026-05-10
Scope: Backend data normalization and cleanup planning only. No frontend redesign. No feature changes.

## Executive Summary

Live hierarchy UI behavior is correct, but hierarchy source data is contaminated by ingestion/mapping issues in the discovery pipeline.

Observed production impact (read-only audit):
- Countries: 37
- States: 40
- Cities: 14,920
- unknown_region states: 30
- Station-like city labels: 2,430
- City names reused across multiple countries: 496 names

This pattern confirms backend-side source normalization failures and cross-country leakage, not a frontend rendering defect.

## Root-Cause Analysis

## 1) OpenAQ country query parameter misuse / weak country validation

In [server/discover_aqi_coverage.js](server/discover_aqi_coverage.js), OpenAQ location fetch uses:

- /locations?country={country.code}

The script then assigns all returned locations directly to the loop country without validating each location’s country identity. This enables cross-country leakage when API filtering differs from expectations.

Evidence:
- [server/aqi_coverage_map.json](server/aqi_coverage_map.json) contains repeated Amsterdam and DPCC station entries under many unrelated countries.
- Production audit shows identical leakage patterns across many countries.

## 2) Station labels treated as end-user city names

The pipeline stores raw station/location labels as city names:
- city_name = loc.name (OpenAQ)
- city_name = station.station.name (WAQI)

This exposes labels such as Anand Vihar, New Delhi - DPCC directly in dropdowns.

## 3) unknown_region placeholder promoted into user hierarchy

State fallback uses unknown_region when admin1/state metadata is missing.
The value is written to aqi_states as if it were a valid region and then returned to frontend.

## 4) WAQI route key assumptions generate malformed country keys

WAQI routes are mapped through limited code-to-name mapping. Unknown keys fall back to raw key values, which previously produced malformed countries (for example 0, 1, 2 in source coverage data).

## 5) No semantic quality gate before population

The population layer validates only basic country-key syntax and inserts regions/cities without semantic checks for:
- station-label filtering
- cross-country plausibility
- duplicate suppression by canonical city identity
- safe handling of missing region metadata

## Affected Data Categories

1. Placeholder regions
- state_name = unknown_region

2. Station-label cities
- Labels with separators/patterns like:
  - Name - Agency
  - Name, City - Authority
  - Uppercase sensor/station prefixes

3. Cross-country leakage
- Same station/city labels appearing under unrelated countries

4. Duplicate/malformed location entries
- Repeated city_name values across many countries without country-consistent geo context

5. Source metadata grouping noise
- aqi_sources and source-origin station labels mixed into user-facing hierarchy layers

## Cleanup and Normalization Rules (Backend)

## A) Country association integrity

- Require per-record country validation before assignment.
- If source record country does not match target country loop context, drop record.
- Do not rely solely on outer request country filter.

## B) Region normalization

- Replace unknown_region with one of:
  - derived region from trusted metadata when available
  - a hidden internal placeholder that is not exposed to UI
- Never expose unknown_region in hierarchy API responses.

## C) City-label sanitation

- Introduce normalization fields:
  - city_display_name (human-readable)
  - station_label (raw source label)
- Filter out obvious station-only labels from dropdown hierarchy unless mapped to a clean city_display_name.
- Preserve raw label only for provenance/debugging.

## D) Duplicate suppression and canonicalization

- Canonical city key = normalized(city_display_name) + country_id + optional region bucket.
- De-duplicate by canonical key and nearest-coordinate clustering tolerance.

## E) Cross-country leakage guard

- Reject inserts where the same raw station label appears across many countries with implausible coordinate spread for that country context.
- Prefer strict source-country field over textual label inference.

## F) Source metadata handling

- Keep source metadata in backend provenance columns.
- Expose only aggregated, human-readable source info to UI (for example source tags, not raw station operator names in city field).

## Safe Migration/Update Strategy

## Phase 0: Protection

1. Keep current production deployment and feature flags unchanged.
2. Snapshot current hierarchy tables.
3. Do not modify frontend hierarchy components.

## Phase 1: Build corrected pipeline (staging only)

1. Update discovery normalization logic with strict country validation.
2. Add region fallback policy that hides unknown placeholders from API output.
3. Add city label sanitizer and canonical dedupe rules.
4. Generate sanitized coverage artifact (versioned).

## Phase 2: Staging data rebuild

1. Truncate/rebuild hierarchy tables in staging from sanitized artifact.
2. Regenerate hierarchy cache.
3. Run endpoint verification and UI smoke tests.

## Phase 3: Data quality gates (must pass)

Required thresholds before production:
- unknown_region exposed to API: 0
- malformed numeric country names: 0
- station-like city labels in dropdown payloads: near 0 (allowlist exceptions only)
- cross-country leakage checks: 0 critical mismatches
- manual search endpoint behavior: unchanged

## Phase 4: Production correction rollout (controlled)

1. Backup production.
2. Execute data correction transaction with rollback guard.
3. Regenerate cache.
4. Re-run hierarchy and backward-compat verification.
5. Observe for 24–48h with stabilization checklist.

## Verification Approach Before Production Corrections

## 1) Automated SQL validation set

- Count unknown regions.
- Count station-like city labels.
- Detect city labels present in multiple countries.
- Validate country/state/city foreign-key consistency.

## 2) API contract validation

- /api/hierarchy/countries returns valid countries only.
- /api/hierarchy/countries/:countryId/states does not return unknown_region.
- /api/hierarchy/countries/:countryId/states/:stateId/cities returns human-readable city entries.
- /api/hybrid-measurements remains stable.

## 3) UI smoke validation (no code changes)

- Country/state/city dropdown loading success.
- No raw station labels presented as city options.
- Manual search fallback fully operational.
- Existing AQI charts and analytics stable.

## 4) Observability validation

- Render logs: no spike in 4xx/5xx due to hierarchy.
- Neon query performance remains within baseline.
- Cache hit behavior remains healthy.
- Frontend console errors remain clean.

## Rollback-Safe Controls

Keep active and unchanged:
- REACT_APP_ENABLE_HIERARCHY_COUNTRY
- REACT_APP_ENABLE_HIERARCHY_STATE
- REACT_APP_ENABLE_HIERARCHY_CITY

Do not remove manual search fallback.

## Out of Scope (Explicitly Excluded)

- AQI maps and heatmaps
- AI features
- Frontend redesign
- Forced hierarchy-only workflow
- Aggressive optimization changes
