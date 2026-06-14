# Hierarchy Data Quality Report

**Generated:** 2026-05-11T03:29:33.263Z

## Executive Summary

This report compares current production hierarchy data against sanitized staging data.
The staging data has been processed through normalization rules to identify and remove data quality issues.

### Key Findings

- **Unknown Region Placeholders Eliminated:** 30 states
- **Station-Label Cities Reduced:** 0 entries
- **Cross-Country Duplicates Reduced:** 0 city names
- **Overall City Count Change:** -2520 (-16.8%)

## Retained Coverage by Country

| Country | Input States | Retained States | Input Cities | Retained Cities |
|---------|--------------:|----------------:|-------------:|----------------:|
| India | 2 | 2 | 501 | 417 |
| China | 2 | 2 | 501 | 417 |
| France | 2 | 2 | 501 | 417 |
| Indonesia | 1 | 1 | 500 | 416 |
| Malaysia | 1 | 1 | 500 | 416 |
| Chile | 1 | 1 | 500 | 416 |
| Peru | 1 | 1 | 500 | 416 |
| Argentina | 1 | 1 | 500 | 416 |
| Dhekelia | 1 | 1 | 500 | 416 |
| Cyprus | 1 | 1 | 500 | 416 |
| Israel | 1 | 1 | 500 | 416 |
| Palestine | 1 | 1 | 500 | 416 |
| Lebanon | 1 | 1 | 500 | 416 |
| Ethiopia | 1 | 1 | 500 | 416 |
| South Sudan | 1 | 1 | 500 | 416 |
| Kenya | 1 | 1 | 500 | 416 |
| Malawi | 1 | 1 | 500 | 416 |
| Guyana | 1 | 1 | 500 | 416 |
| Republic of Korea | 1 | 1 | 500 | 416 |
| Morocco | 1 | 1 | 500 | 416 |
| Costa Rica | 1 | 1 | 500 | 416 |
| Nicaragua | 1 | 1 | 500 | 416 |
| Democratic Republic of the Congo | 1 | 1 | 500 | 416 |
| Bhutan | 1 | 1 | 500 | 416 |
| Ukraine | 1 | 1 | 500 | 416 |
| South Africa | 1 | 1 | 500 | 416 |
| Saint-Martin | 1 | 1 | 500 | 416 |
| Oman | 1 | 1 | 500 | 416 |
| Uzbekistan | 1 | 1 | 500 | 416 |
| Kazakhstan | 1 | 1 | 500 | 416 |
| Japan | 1 | 1 | 1 | 1 |
| United States | 1 | 1 | 1 | 1 |
| United Kingdom | 1 | 1 | 1 | 1 |
| Brazil | 1 | 1 | 1 | 1 |
| United Arab Emirates | 1 | 1 | 1 | 1 |
| Egypt | 1 | 1 | 1 | 1 |
| Australia | 1 | 1 | 1 | 1 |

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
| Countries | 37 |
| States | 40 |
| Cities | 12490 |
| Unknown Regions | 0 ✅ |
| Station-Label Cities | 0 ✅ |
| Cross-Country Duplicates | 20 ✅ |

## Improvements

| Metric | Change | % Change |
|--------|--------|----------|
| Countries | -3 | -7.5% |
| States | 0 | 0.0% |
| Cities | -2520 | -16.8% |
| Unknown Regions | -30 | 100% eliminated |
| Station Labels | -0 | NaN% reduced |
| Duplicates | -0 | 0.0% reduced |

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
- Cross-country leaks: 415
- Invalid records: undefined

## Sanitizer Rule Counts

| Rule | Count |
|------|------:|
| malformed_country_key | 3 |
| invalid_country_shape | 0 |
| placeholder_state_normalized | 30 |
| invalid_state | 0 |
| invalid_city_record | 0 |
| station_label_only | 2430 |
| cross_country_duplicate | 90 |
| invalid_coordinates | 0 |

## Removed Entry Examples

### malformed_country_key

1. {"country_key":"0"}
2. {"country_key":"1"}
3. {"country_key":"2"}

### station_label_only

1. {"country":"Indonesia","state":"unknown_region","raw_label":"NMA - Nima","display_name":"NMA"}
2. {"country":"Indonesia","state":"unknown_region","raw_label":"NMT - Nima","display_name":"NMT"}
3. {"country":"Indonesia","state":"unknown_region","raw_label":"JTA - Jamestown","display_name":"JTA"}
4. {"country":"Indonesia","state":"unknown_region","raw_label":"ADT - Asylum Down","display_name":"ADT"}
5. {"country":"Indonesia","state":"unknown_region","raw_label":"ADEPA - Asylum Down","display_name":"ADEPA"}

### cross_country_duplicate

1. {"country":"Indonesia","state":"unknown_region","city_name":"Alto Hospicio","coordinates":{"lat":-20.290859340668,"lon":-70.09955406189}}
2. {"country":"Indonesia","state":"unknown_region","city_name":"MMFRA1001","coordinates":{"lat":39.482385,"lon":-121.221128}}
3. {"country":"Indonesia","state":"unknown_region","city_name":"QUILICURA","coordinates":{"lat":-33.34970931173,"lon":-70.724530220031}}
4. {"country":"Malaysia","state":"unknown_region","city_name":"Alto Hospicio","coordinates":{"lat":-20.290859340668,"lon":-70.09955406189}}
5. {"country":"Malaysia","state":"unknown_region","city_name":"MMFRA1001","coordinates":{"lat":39.482385,"lon":-121.221128}}

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

