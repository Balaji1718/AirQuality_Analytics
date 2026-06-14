# Hierarchy Sanitization & Universal Search Autocomplete Cleanup Recommendations

This implementation plan outlines the prioritized recommendations to sanitize the location hierarchy database and finalize Universal Search readiness. 

**Do NOT implement these changes yet.** These are evidence-based recommendations following Phase 1-3 audits.

---

## Priority 1: Hierarchy Contamination SQL & JS Fixes

### A. Database Cleanup (SQL)
The `aqi_cities` database table is heavily contaminated with:
1. **Unrelated Stations as Cities**: 2,494 entries contain station suffixes (like `CPCB`, `DPCC`, `SPARTAN`) incorrectly stored as municipalities.
2. **Cross-Country Corruption**: E.g. Delhi stations listed under Argentina's `unknown_region`.

#### Actionable SQL Remediation Script:
```sql
-- 1. Identify and delete entries with obvious station suffix keywords in city names
DELETE FROM aqi_cities
WHERE city_name ~* '(cpcb|dpcc|spcb|aqms|monitor|station|university|school|technological|institute|hospital|airport|high school|metro)';

-- 2. Delete cross-country coordinate mismatches using bounding box constraints
-- Delete cities assigned to Argentina (country_id = X) whose coordinates are in India
DELETE FROM aqi_cities
WHERE country_id = (SELECT id FROM aqi_countries WHERE country_name = 'Argentina')
  AND latitude >= 6 AND latitude <= 37.5 
  AND longitude >= 68 AND longitude <= 98;

-- Delete cities assigned to India whose coordinates are outside India bounds
DELETE FROM aqi_cities
WHERE country_id = (SELECT id FROM aqi_countries WHERE country_name = 'India')
  AND NOT (latitude >= 6 AND latitude <= 37.5 AND longitude >= 68 AND longitude <= 98);
```

### B. JavaScript Cleanup in validationMatch
Keep the context-aware confidence boost for local results intact while rejecting foreign cities that do not match the target country bounding boxes.

---

## Priority 2: Removal of `unknown_region` Exposure

The `unknown_region` state name is exposed in the frontend search dropdowns for 30 out of 37 monitored countries.

### Actionable Remediation:
1. **Database Update (SQL)**:
   Rename synthetic or fallback states in the database to match the country's default naming convention (or merge them into valid state names).
   ```sql
   -- Update unknown_regions to General region overview or default to Country overview
   UPDATE aqi_states
   SET state_name = 'General region'
   WHERE state_name = 'unknown_region';
   ```
2. **API Filtering (JS)**:
   Modify the hierarchy API endpoints (`server/hierarchy.js`) to exclude regions named `'unknown_region'` or `'General Region'` from the autocomplete array responses, returning empty/fallback lists instead.
   ```javascript
   // Inside GET /api/hierarchy/countries/:countryId/states
   const cleanStates = states.filter(s => 
     s.state_name !== 'unknown_region' && 
     s.state_name !== 'General Region'
   );
   ```

---

## Priority 3: Universal Autocomplete Improvements

### A. Fix Foreign Region Country Hardcoding
Currently, state/region queries (like `Texas`, `California`, `Ontario`) are resolved with country `India` because `buildHierarchicalSearchContext()` hardcodes `countryObj = findCountryByQuery('India')` for all region-level queries.

#### Recommended JavaScript Fix:
Refactor [index.js](file:///d:/AirQuality_Analytics/server/index.js) at line 327 to dynamically resolve the country matching the matched state:
```javascript
  if (intent.level === 'region') {
    const stateName = intent.resolvedName;
    
    // Dynamically map state to its correct country
    let targetCountryName = 'India'; // Default fallback
    const usStates = ['texas', 'california', 'new york', 'illinois', 'florida', 'washington'];
    const caStates = ['ontario', 'british columbia', 'quebec'];
    
    const stateNorm = stateName.toLowerCase();
    if (usStates.includes(stateNorm)) {
      targetCountryName = 'United States';
    } else if (caStates.includes(stateNorm)) {
      targetCountryName = 'Canada';
    }
    
    const countryObj = globalCountriesDatabase.find(c => c.name === targetCountryName) || null;
    const apiQueries = [`${stateName}, ${targetCountryName}`];
    
    return {
      query,
      level: 'region',
      country: countryObj,
      state: stateName,
      regionCandidates: [stateName],
      apiQueries,
      displayLabel: `${stateName}, ${countryObj?.name || targetCountryName}`
    };
  }
```

### B. Client-side Autocomplete Cache-Busting
Ensure that browser caching does not serve stale autocomplete data when users are typing dynamically. Add cache key hashes to `/api/hierarchy/search?q=...` endpoints.

---

## Priority 4: Hierarchy Coverage Expansion

Currently, only a few states are mapped in the database for non-Indian countries.
1. **Dynamic Seeding**: During automatic hourly data collection, if a city is successfully geocoded via OpenWeather and contains valid state metadata, upsert the state into `aqi_states` and associate the city to it.
2. **Metadata Syncing**: Cross-reference coordinates against open-source datasets to populate missing `iso2`/`iso3` country codes.

---

## Priority 5: Optional Migration of Hierarchy Dropdowns into Advanced Filters

To establish a **Universal Search First** interface:
1. **Simplify Header**: Remove the Country, State, and City dropdown select elements from the main header area.
2. **Advanced Filters Pane**: Place these three hierarchical selection boxes inside an expandable "Advanced Filters" drawer or accordion panel next to the date filters.
3. **Primary Entrypoint**: Promote the text input bar as the primary universal entrypoint where users type any country, state, city, locality, or station query directly.
