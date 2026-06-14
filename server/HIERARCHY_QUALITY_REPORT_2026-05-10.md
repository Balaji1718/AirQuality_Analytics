# Hierarchy Data Quality Report

**Generated:** 2026-05-10T16:41:39.069Z

## Executive Summary

This report compares current production hierarchy data against sanitized staging data.
The staging data has been processed through normalization rules to identify and remove data quality issues.

### Key Findings

- **Unknown Region Placeholders Eliminated:** 30 states
- **Station-Label Cities Reduced:** 0 entries
- **Cross-Country Duplicates Reduced:** 20 city names
- **Overall City Count Change:** -15000 (-99.9%)

## Detailed Metrics

### Production Data

| Metric | Count |
|--------|-------|
| Countries | 40 |
| States | 40 |
| Cities | 15010 |
| Unknown Regions | 30 ⚠️ |
| Station-Label Cities | 0 ⚠️ |
| Cross-Country Duplicates | 20 ⚠️ |

### Staging Data (After Sanitization)

| Metric | Count |
|--------|-------|
| Countries | 10 |
| States | 10 |
| Cities | 10 |
| Unknown Regions | 0 ✅ |
| Station-Label Cities | 0 ✅ |
| Cross-Country Duplicates | 0 ✅ |

## Improvements

| Metric | Change | % Change |
|--------|--------|----------|
| Countries | -30 | -75.0% |
| States | -30 | -75.0% |
| Cities | -15000 | -99.9% |
| Unknown Regions | -30 | 100% eliminated |
| Station Labels | -0 | NaN% reduced |
| Duplicates | -20 | 100.0% reduced |

## Quality Validation Results

### Production Data Validation

**Status:** ❌ Issues Found

- Unknown regions: 30
- Station-label cities: 2430
- Cross-country leaks: 497
- Invalid records: undefined

### Staging Data Validation

**Status:** ✅ Passes

- Unknown regions: 0
- Station-label cities: 0
- Cross-country leaks: 0
- Invalid records: undefined

## Top Cross-Country Duplicates (Before Sanitization)

These city names appear in multiple countries in production:

1. **Alto Hospicio** - appears in 60 countries
2. **MMFRA1001** - appears in 60 countries
3. **QUILICURA ** - appears in 60 countries
4. **NMA - Nima** - appears in 30 countries
5. **NMT - Nima** - appears in 30 countries
6. **JTA - Jamestown** - appears in 30 countries
7. **ADT - Asylum Down** - appears in 30 countries
8. **ADEPA - Asylum Down** - appears in 30 countries
9. **ADA - Asylum Down** - appears in 30 countries
10. **ELC - East Legon** - appears in 30 countries
11. **ELT - East Legon** - appears in 30 countries
12. **ELA - East Legon** - appears in 30 countries
13. **SPARTAN - IIT Kanpur** - appears in 30 countries
14. **Delhi Technological University, Delhi - CPCB** - appears in 30 countries
15. **SPARTAN - CITEDEF** - appears in 30 countries

## Sanitization Rules Applied

The staging data was processed using the following rules:

1. **Strict Country Validation** - Per-record validation against source metadata
2. **Unknown Region Filtering** - Rejected all unknown_* placeholder states
3. **Station-Label Sanitization** - Normalized and filtered raw monitoring station labels
4. **Coordinate Validation** - Rejected entries with missing or invalid lat/lon
5. **Cross-Country Leakage Detection** - Identified and logged implausible duplicates
6. **Canonical City Deduplication** - Used location-aware hashing to eliminate duplicates

## Recommendations

### Immediate Actions (Staging Only)
1. Verify sanitized artifact contains expected city counts
2. Test frontend hierarchy dropdowns against staging API
3. Run comprehensive endpoint test suite (verify_hierarchy_endpoints.js)
4. Validate all 5 hierarchy endpoints work correctly
5. Confirm manual AQI search still works as fallback

### Before Production Application
1. Compare manual search results between production and staging
2. Verify no critical location data was removed
3. Review top changes to ensure they align with cleanup goals
4. Consider gradual rollout (e.g., by country) if audit finds issues
5. Establish post-merge monitoring checklist

## Data Protection Notes

- ✅ Production database remains unchanged during this phase
- ✅ Staging environment is isolated for testing
- ✅ Feature flags remain active; manual search fallback preserved
- ✅ All normalization rules are read-only; no source data modified
- ✅ Before/after comparison is transparent and auditable

