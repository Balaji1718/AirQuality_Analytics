# Hierarchy API Endpoints Documentation

## Overview

The Hierarchy API provides isolated, feature-safe endpoints for accessing regional AQI coverage data organized by country → state → city. These endpoints are completely separate from existing production endpoints and have **zero impact** on existing functionality.

**Status:** ✅ Fully implemented and tested (29/29 tests passed)  
**Isolation:** ✅ Complete - no modifications to existing endpoints  
**Backward Compatibility:** ✅ Verified - all existing APIs function normally  

---

## Base URL

```
http://localhost:5000/api/hierarchy
```

---

## Endpoints

### 1. GET `/api/hierarchy/countries`

**Description:** Get list of all countries with AQI data

**Query Parameters:**
- `limit` (number, optional): Max results per page (default: 100, max: 1000)
- `offset` (number, optional): Skip N results (default: 0)

**Response (200 OK):**
```json
{
  "countries": [
    {
      "id": "India",
      "name": "India",
      "iso2": "IN",
      "regions": 15,
      "sources": ["openaq", "waqi"],
      "hasData": true
    }
  ],
  "total": 37,
  "limit": 100,
  "offset": 0,
  "cached": true,
  "cacheTimestamp": "2026-05-10T05:51:30.000Z"
}
```

**Example Request:**
```bash
curl "http://localhost:5000/api/hierarchy/countries?limit=5"
```

---

### 2. GET `/api/hierarchy/countries/:countryId/states`

**Description:** Get states/regions for a specific country

**Path Parameters:**
- `countryId` (string, required): Country name (e.g., "India", "United States")

**Query Parameters:**
- `limit` (number, optional): Max results (default: 100, max: 1000)
- `offset` (number, optional): Skip N results (default: 0)

**Response (200 OK - Found):**
```json
{
  "countryId": "India",
  "countryName": "India",
  "states": [
    {
      "id": "Delhi",
      "name": "Delhi",
      "cities": 8,
      "sources": ["openaq"],
      "hasData": true
    }
  ],
  "total": 15,
  "limit": 100,
  "offset": 0
}
```

**Response (200 OK - Not Found/Empty):**
```json
{
  "empty": true,
  "message": "Country 'UnknownCountry' not found or has no AQI coverage data",
  "countryId": "UnknownCountry",
  "states": [],
  "total": 0
}
```

**Example Request:**
```bash
curl "http://localhost:5000/api/hierarchy/countries/India/states?limit=10"
```

---

### 3. GET `/api/hierarchy/countries/:countryId/states/:stateId/cities`

**Description:** Get cities for a specific state with pagination

**Path Parameters:**
- `countryId` (string, required): Country name
- `stateId` (string, required): State/region name

**Query Parameters:**
- `limit` (number, optional): Max results (default: 50, max: 500)
- `offset` (number, optional): Skip N results (default: 0)

**Response (200 OK - Found):**
```json
{
  "countryId": "India",
  "countryName": "India",
  "stateId": "Delhi",
  "stateName": "Delhi",
  "cities": [
    {
      "id": "New Delhi",
      "name": "New Delhi",
      "coordinates": {
        "latitude": 28.6139,
        "longitude": 77.2090
      },
      "source": "openaq",
      "measurements": 150
    }
  ],
  "total": 8,
  "limit": 50,
  "offset": 0,
  "hasMore": false
}
```

**Example Request:**
```bash
curl "http://localhost:5000/api/hierarchy/countries/India/states/Delhi/cities?limit=20&offset=0"
```

---

### 4. GET `/api/hierarchy/search`

**Description:** Search across all hierarchy levels (countries, states, cities)

**Query Parameters:**
- `q` (string, required): Search query (min 1 character)
- `limit` (number, optional): Max results (default: 20, max: 100)
- `type` (string, optional): Filter by type - "country", "state", "city", or omit for all

**Response (200 OK):**
```json
{
  "query": "Delhi",
  "searchNormalized": "delhi",
  "results": [
    {
      "type": "country",
      "id": "India",
      "name": "India",
      "iso2": "IN",
      "regions": 15,
      "path": "India"
    },
    {
      "type": "state",
      "id": "Delhi",
      "name": "Delhi",
      "country": "India",
      "cities": 8,
      "path": "India > Delhi"
    },
    {
      "type": "city",
      "id": "New Delhi",
      "name": "New Delhi",
      "country": "India",
      "state": "Delhi",
      "coordinates": {
        "latitude": 28.6139,
        "longitude": 77.2090
      },
      "source": "openaq",
      "path": "India > Delhi > New Delhi"
    }
  ],
  "total": 3,
  "limit": 20
}
```

**Example Requests:**
```bash
# Search all types
curl "http://localhost:5000/api/hierarchy/search?q=United&limit=10"

# Search only countries
curl "http://localhost:5000/api/hierarchy/search?q=United&type=country"

# Search only cities
curl "http://localhost:5000/api/hierarchy/search?q=New&type=city&limit=5"
```

---

### 5. POST `/api/hierarchy/validate`

**Description:** Trigger validation of hierarchy data (returns current cached status)

**Request Body:**
```json
{}
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "message": "Hierarchy validation complete",
  "timestamp": "2026-05-10T05:51:30.000Z",
  "metadata": {
    "totalCountries": 37,
    "countriesWithData": 30,
    "countriesPartialCoverage": 7,
    "cacheStatus": "active",
    "ttl": 300
  }
}
```

**Example Request:**
```bash
curl -X POST "http://localhost:5000/api/hierarchy/validate" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## Error Handling

### Graceful Empty Responses

All endpoints return **200 OK** with `empty: true` for unsupported regions:

```json
{
  "empty": true,
  "message": "Country 'UnknownCountry' not found or has no AQI coverage data",
  "cities": [],
  "total": 0
}
```

This ensures frontend robustness: no 404 errors, always consistent JSON shape.

### Validation Errors

Missing required parameters return **400 Bad Request**:

```json
{
  "error": "countryId and stateId are required",
  "empty": true
}
```

### Server Errors

Unexpected errors return **500 Internal Server Error** with details:

```json
{
  "error": "Failed to retrieve countries",
  "details": "Error message",
  "empty": true
}
```

---

## Caching

The hierarchy API uses **in-memory caching** with a 5-minute TTL:

- **Countries list**: Cached for 5 minutes (unless pagination is used)
- **States list** (per country): Cached for 5 minutes
- **Cities list** (per state): NOT cached (always fresh for pagination reliability)
- **Search results**: NOT cached (always fresh)

Cached responses include `cached: true` and `cacheTimestamp`:

```json
{
  "countries": [...],
  "cached": true,
  "cacheTimestamp": "2026-05-10T05:51:30.000Z"
}
```

---

## Pagination Rules

### Limits & Maximums
- **Countries**: default 100, max 1000
- **States**: default 100, max 1000
- **Cities**: default 50, max 500 (stricter to prevent overload)
- **Search**: default 20, max 100

### Bounds Checking
- `offset` must be >= 0
- `limit` must be >= 1
- If `offset >= total`, response returns gracefully with `empty: true`

### Pagination Flags
The `hasMore` flag indicates if more results are available:

```json
{
  "cities": [...],
  "total": 150,
  "limit": 50,
  "offset": 0,
  "hasMore": true  // More results available
}
```

---

## Feature-Safe Routing

✅ **Complete Isolation**
- Hierarchy endpoints are in a separate `hierarchy.js` module
- Mounted at `/api/hierarchy/*` via Express router
- No modifications to existing endpoints
- Zero impact on production behavior

✅ **Backward Compatibility**
- All existing APIs (`/api/hybrid-measurements`, `/api/locations`, etc.) continue to work
- No schema changes required until migration runs
- Frontend remains untouched

✅ **Production Ready**
- Graceful error handling (no unexpected crashes)
- Pagination prevents memory overload
- Caching reduces database load
- Request timeouts prevent hanging

---

## Data Sources

Coverage data comes from:
- **OpenAQ v3**: Primary source, 137 countries
- **WAQI**: Secondary source, 11000+ stations worldwide
- **Local Database**: Populated after migration runs

Currently, the hierarchy API works with `aqi_coverage_map.json` loaded at startup. After the migration runs, it will also query the new `aqi_countries`, `aqi_states`, `aqi_cities`, and `aqi_hierarchy_cache` tables.

---

## Testing

All 5 hierarchy endpoints are covered by comprehensive verification tests:

```bash
# Run verification tests
npm test  # or
node verify_hierarchy_endpoints.js
```

**Test Coverage (29 tests):**
- ✅ Endpoint functionality
- ✅ Pagination bounds
- ✅ Caching behavior
- ✅ Error handling
- ✅ Graceful 404/empty responses
- ✅ Input validation
- ✅ Isolation & backward compatibility

---

## Integration Notes

### Before Migration
- Hierarchy endpoints query `aqi_coverage_map.json`
- Data is read-only and loaded at server startup
- Perfect for testing frontend integration

### After Migration
- Endpoints will also query `aqi_countries`, `aqi_states`, `aqi_cities` tables
- Migration must be **manual-only** (see `MIGRATION_RUNBOOK.md`)
- Cache invalidation triggers after migration runs
- No code changes needed in hierarchy.js (compatible with both states)

### Frontend Integration (Future)
- Hierarchy endpoints are **not yet wired to frontend**
- They're available for manual testing via curl/Postman
- Integration will follow once migration is verified
- Current frontend remains untouched (per requirement)

---

## Migration Impact

**During current phase (before migration):**
- Hierarchy endpoints: ✅ Working (via coverage map JSON)
- Existing AQI endpoints: ✅ Unchanged
- Database: No schema changes yet
- Frontend: No changes

**After migration runs (future phase):**
- Hierarchy endpoints: ✅ Enhanced (querying new tables)
- Existing AQI endpoints: ✅ Still unchanged
- Database: New hierarchy tables created
- Frontend: Optional future integration

See `MIGRATION_RUNBOOK.md` for migration strategy.

---

## API Response Shape (Guaranteed)

All hierarchy endpoints return consistent JSON:

```json
{
  "countries": [...],  // OR "states": [...] OR "cities": [...] OR "results": [...]
  "total": N,
  "limit": N,
  "offset": N,
  "cached": false,     // Optional
  "empty": false,      // Optional (true if no data)
  "error": null,       // Optional (if error occurred)
  "message": ""        // Optional (if explanation needed)
}
```

This consistency ensures frontend code can handle all responses uniformly.

---

## Next Steps

1. ✅ Hierarchy API endpoints implemented and verified
2. ✅ Isolated from production without any modifications
3. ⏳ Manual migration execution (staged, when ready)
4. ⏳ Database population with hierarchy tables
5. ⏳ Frontend integration (optional, requires user action)

---

## Support & Debugging

### Enable Debug Logs
The hierarchy router logs startup messages:
```
✅ Hierarchy: Loaded 37 countries with coverage data
✅ Hierarchy API routes mounted at /api/hierarchy/*
```

### Check Cache Status
Call `/api/hierarchy/validate` to see current metadata:
```bash
curl -X POST "http://localhost:5000/api/hierarchy/validate"
```

### Manual Testing
```bash
# Test all endpoints
curl http://localhost:5000/api/hierarchy/countries
curl "http://localhost:5000/api/hierarchy/countries/India/states"
curl "http://localhost:5000/api/hierarchy/search?q=Delhi"
curl -X POST http://localhost:5000/api/hierarchy/validate
```
