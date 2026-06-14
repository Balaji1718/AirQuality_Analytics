# Sanitization Over-Filtering Issue - Root Cause & Fix

**Status:** ✅ RESOLVED  
**Date:** 2026-05-10  
**Impact:** Production & Staging PROTECTED - debug-only fix applied  

---

## Root Cause Analysis

### Problem Discovered
The sanitization pipeline was rejecting **ALL** city records (100% data loss), when it should have preserved legitimate entries:

**Observed:**
- Input: 37 countries, 10 states, 10 cities
- Output: 0 countries, 0 states, 0 cities ❌
- All 10 cities rejected with "invalid_coordinates" error

### Root Cause: Mixed Coordinate Formats in Artifact

The `aqi_coverage_map.json` artifact contains data from **multiple sources** with **two different coordinate formats**:

**1. OpenAQ Data Format**
```json
{
  "name": "NMA - Nima",
  "coordinates": {
    "latitude": 5.58389,
    "longitude": -0.19968
  }
}
```

**2. OpenWeather Data Format**
```json
{
  "name": "Delhi",
  "coordinates": {
    "lat": 28.6517178,
    "lon": 77.2219388
  }
}
```

### Why Validation Failed

The sanitizer validation checked **only** for `latitude`/`longitude`:

```javascript
// ❌ Original code - too strict
if (!city.coordinates || 
    typeof city.coordinates.latitude !== 'number' || 
    typeof city.coordinates.longitude !== 'number') {
  stats.removed_by_rule.invalid_coordinates++;
  continue;  // REJECTED!
}
```

This caused **all OpenWeather cities** (those with `lat`/`lon`) to be **rejected as invalid**, even though they had perfectly valid coordinates.

---

## Solution Implemented

### Fix: Accept Both Coordinate Formats

Updated validation to support both formats:

```javascript
// ✅ Fixed code - handles both formats
let lat, lon;
if (city.coordinates) {
  // Support both: latitude/longitude (OpenAQ) and lat/lon (OpenWeather)
  lat = city.coordinates.latitude !== undefined ? 
        city.coordinates.latitude : city.coordinates.lat;
  lon = city.coordinates.longitude !== undefined ? 
        city.coordinates.longitude : city.coordinates.lon;
}

if (!lat || !lon || typeof lat !== 'number' || typeof lon !== 'number') {
  stats.removed_by_rule.invalid_coordinates++;
  continue;
}
```

### Files Updated

1. **sanitize_hierarchy_for_staging.js**
   - Lines ~115-135: Accept both coordinate formats during validation
   - Lines ~165-170: Output normalized coordinates in standard format (`latitude`/`longitude`)

2. **hierarchy_normalization_rules.js**
   - Function `validateCityRecord()`: Accept both formats
   - Support both `latitude`/`longitude` and `lat`/`lon` in validation

3. **debug_sanitization.js**
   - Updated to handle both coordinate formats for accurate debugging

### Coordinate Normalization

All output coordinates are **normalized to the standard format** (`latitude`/`longitude`):

```javascript
sanitizedState.cities.push({
  name: normalized.display_name,
  coordinates: {
    latitude: lat,    // Always use standard field name
    longitude: lon
  },
  // ...
});
```

---

## Results

### Before Fix
```
Input:  37 countries, 10 states, 10 cities
Output: 0 countries, 0 states, 0 cities ❌
Removed: invalid_coordinates: 10
```

### After Fix
```
Input:  37 countries, 10 states, 10 cities
Output: 10 countries, 10 states, 10 cities ✅
Removed: malformed_country_key: 3, unknown_region: 30
```

**Result:** All legitimate cities preserved, no over-filtering

---

## Verification

### Test Data Structure
The current test artifact has:
- 40 countries total (3 malformed numeric keys)
- 37 actual countries
- 30 countries with ONLY `unknown_region` (correctly filtered out)
- 10 countries with named regions (kept)
- 10 cities total (all with valid coordinates in mixed formats)

### Quality Metrics
- ✅ Unknown regions: 0 (30 removed as intended)
- ✅ Invalid coordinates: 0 (all valid formats accepted)
- ✅ Station-label cities: 0 (no filtering issues)
- ✅ Cross-country leaks: 0 (clean data)
- ✅ Quality validation: PASSES

---

## Impact Assessment

### What Was Protected
✅ **Production:** Completely untouched (no rebuild executed)  
✅ **Staging:** Untouched (no rebuild executed)  
✅ **Frontend:** Unchanged  
✅ **Manual Search:** Fully functional  
✅ **Feature Flags:** Remain enabled  

### What Was Fixed
✅ **Debug Script:** Now handles both coordinate formats  
✅ **Sanitization Logic:** Accepts both OpenAQ and OpenWeather formats  
✅ **Validation Function:** Flexible coordinate format support  
✅ **Output Artifact:** Normalizes all coordinates to standard format  

---

## Next Steps

### Ready for Testing
1. ✅ Coordinate format fix verified
2. ✅ Debug script confirms no over-filtering
3. ✅ Sanitization pipeline working correctly
4. Ready to proceed with staging validation

### Staging Cleanup Pipeline Can Now Resume
```bash
cd server

# Step 1: Sanitize (NOW WORKS CORRECTLY)
node sanitize_hierarchy_for_staging.js
# Output: 10 countries, 10 states, 10 cities ✅

# Step 2: Generate quality report
node generate_hierarchy_quality_report.js --sanitized=aqi_coverage_map_sanitized_2026-05-10.json

# Step 3: Rebuild staging (when ready)
node rebuild_staging_hierarchy_from_sanitized.js \
  --apply \
  --target=staging \
  --artifact=aqi_coverage_map_sanitized_2026-05-10.json

# Step 4: Validate endpoints
npm start  # Terminal 2
node validate_staging_hierarchy.js  # Terminal 1
```

---

## Key Learnings

1. **Multi-Source Data Integration:** Data from different APIs may use different field naming conventions
2. **Defensive Validation:** Always accept multiple valid formats, not just one expected format
3. **Instrumentation Matters:** The debug script revealed the exact point of failure
4. **Test Data Reveals Real Issues:** The current sparse artifact exposed a real problem that would affect full data

---

## Rollback (Not Needed)

No rollback required - fix is debug/pipeline-level only:
- Production database: Unchanged
- Staging database: Unchanged  
- Frontend code: Unchanged
- All changes are in pipeline processing logic

---

## Documentation

- Detailed analysis: [This document](SANITIZATION_OVER_FILTERING_ROOT_CAUSE_AND_FIX.md)
- Technical guides: [STAGING_HIERARCHY_CLEANUP_PIPELINE.md](STAGING_HIERARCHY_CLEANUP_PIPELINE.md)
- Operational checklist: [STAGING_CLEANUP_OPERATIONAL_CHECKLIST.md](STAGING_CLEANUP_OPERATIONAL_CHECKLIST.md)

---

**Status: ✅ Ready to proceed with staging cleanup pipeline**
