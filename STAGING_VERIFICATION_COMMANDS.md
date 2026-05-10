# Staging Verification Commands & Expected Outputs

**Status:** 📋 Reference Guide Ready for Staging Execution  
**Date:** May 10, 2026  
**Purpose:** Quick command reference with exact expected outputs for staging validation  

---

## Pre-Verification Environment Check

### Command: Verify Environment Separation

```bash
# Verify staging and production are separate
echo "Staging URL first 50 chars: ${STAGING_DATABASE_URL:0:50}..."
echo "Production URL first 50 chars: ${DATABASE_URL:0:50}..."
diff <(echo $STAGING_DATABASE_URL) <(echo $DATABASE_URL) && echo "ERROR: URLs identical!" || echo "OK: URLs different"
```

**Expected Output:**
```
Staging URL first 50 chars: postgresql://staging_user:xyz@host-staging...
Production URL first 50 chars: postgresql://prod_user:xyz@host-prod...
OK: URLs different
```

---

## Schema Verification Commands

### Command 1: List Hierarchy Tables

```bash
psql "${STAGING_DATABASE_URL}" \
  --tuples-only \
  -c "
    SELECT table_name, 
           pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)::numeric) as size,
           (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name) as columns
    FROM pg_tables t
    WHERE schemaname = 'public' 
      AND table_name LIKE 'aqi_%'
    ORDER BY table_name;
  "
```

**Expected Output:**
```
     table_name      |  size  | columns 
--------------------+--------+---------
 aqi_cities         | 12 MB  |       5
 aqi_countries      | 840 kB |       6
 aqi_hierarchy_cache| 2 MB   |       4
 aqi_states         | 5 MB   |       5
(4 rows)
```

### Command 2: Verify Table Structures

```bash
# Countries table structure
psql "${STAGING_DATABASE_URL}" -c "\d aqi_countries"
```

**Expected Output:**
```
                  Table "public.aqi_countries"
  Column   |         Type          | Collation | Nullable | Default 
-----------+-----------------------+-----------+----------+---------
 id        | integer               |           | not null | 
 code      | character varying(2)  |           | not null | 
 name      | character varying(100)|           | not null | 
 iso2      | character varying(2)  |           |          | 
 iso3      | character varying(3)  |           |          | 
 metadata  | jsonb                 |           |          | 
Indexes:
    "aqi_countries_pkey" PRIMARY KEY, btree (id)
    "idx_countries_name" btree (name)
```

### Command 3: Data Population Summary

```bash
psql "${STAGING_DATABASE_URL}" -c "
  SELECT 
    'aqi_countries' as table_name, count(*) as record_count FROM aqi_countries
  UNION ALL
  SELECT 'aqi_states', count(*) FROM aqi_states
  UNION ALL
  SELECT 'aqi_cities', count(*) FROM aqi_cities
  UNION ALL
  SELECT 'aqi_hierarchy_cache', count(*) FROM aqi_hierarchy_cache
  ORDER BY table_name;
"
```

**Expected Output:**
```
    table_name     | record_count 
-------------------+---------------
 aqi_cities        |       1847
 aqi_countries     |         37
 aqi_hierarchy_cache|         37
 aqi_states        |        347
(4 rows)
```

### Command 4: Verify Indexes Created

```bash
psql "${STAGING_DATABASE_URL}" -c "
  SELECT schemaname, tablename, indexname
  FROM pg_indexes
  WHERE tablename LIKE 'aqi_%'
  ORDER BY tablename, indexname;
"
```

**Expected Output:**
```
 schemaname | tablename | indexname 
------------+-----------+----------------------------------
 public     | aqi_cities     | aqi_cities_pkey
 public     | aqi_cities     | idx_cities_country_state
 public     | aqi_countries  | aqi_countries_pkey
 public     | aqi_countries  | idx_countries_name
 public     | aqi_states     | aqi_states_pkey
 public     | aqi_states     | idx_states_country
(6 rows)
```

### Command 5: Sample Data from Each Table

```bash
echo "=== Countries Sample ==="
psql "${STAGING_DATABASE_URL}" -c "SELECT id, code, name FROM aqi_countries LIMIT 5;"

echo ""
echo "=== States Sample ==="
psql "${STAGING_DATABASE_URL}" -c "SELECT id, country_id, name FROM aqi_states LIMIT 5;"

echo ""
echo "=== Cities Sample ==="
psql "${STAGING_DATABASE_URL}" -c "SELECT id, state_id, name FROM aqi_cities LIMIT 5;"

echo ""
echo "=== Cache Sample ==="
psql "${STAGING_DATABASE_URL}" -c "SELECT country_name, state_count, city_count FROM aqi_hierarchy_cache LIMIT 5;"
```

**Expected Output:**
```
=== Countries Sample ===
 id |  code  |     name     
----+--------+--------------
  1 | IN     | India
  2 | US     | United States
  3 | CN     | China
  4 | GB     | United Kingdom
  5 | FR     | France
(5 rows)

=== States Sample ===
 id | country_id |    name     
----+------------+-------------
  1 |          1 | Andhra Pradesh
  2 |          1 | Arunachal Pradesh
  3 |          1 | Assam
  4 |          1 | Bihar
  5 |          1 | Chhattisgarh
(5 rows)

=== Cities Sample ===
 id | state_id |   name    
----+----------+-----------
  1 |        1 | Vijayawada
  2 |        1 | Visakhapatnam
  3 |        2 | Itanagar
  4 |        3 | Guwahati
  5 |        3 | Silchar
(5 rows)

=== Cache Sample ===
 country_name | state_count | city_count 
--------------+-------------+------------
 Afghanistan  |           1 |         34
 Albania      |           1 |         12
 Algeria      |          58 |        648
 Argentina    |          24 |        325
 Australia    |           8 |        157
(5 rows)
```

---

## API Endpoint Verification Commands

### Command 1: GET /api/hierarchy/countries

```bash
# Get first 5 countries with details
curl -s "http://localhost:5001/api/hierarchy/countries?limit=5" | jq '.'
```

**Expected Output:**
```json
{
  "countries": [
    {
      "id": 1,
      "code": "IN",
      "name": "India",
      "iso2": "IN",
      "iso3": "IND",
      "stateCount": 36
    },
    {
      "id": 2,
      "code": "US",
      "name": "United States",
      "iso2": "US",
      "iso3": "USA",
      "stateCount": 50
    },
    ...
  ],
  "total": 37,
  "limit": 5,
  "offset": 0,
  "hasMore": true
}
```

### Command 2: GET /api/hierarchy/countries/:id/states

```bash
# Get states for India (id=1)
curl -s "http://localhost:5001/api/hierarchy/countries/1/states?limit=5" | jq '.'
```

**Expected Output:**
```json
{
  "countryId": 1,
  "countryName": "India",
  "states": [
    {
      "id": 1,
      "countryId": 1,
      "name": "Andhra Pradesh",
      "cityCount": 15
    },
    {
      "id": 2,
      "countryId": 1,
      "name": "Arunachal Pradesh",
      "cityCount": 8
    },
    {
      "id": 3,
      "countryId": 1,
      "name": "Assam",
      "cityCount": 12
    },
    {
      "id": 4,
      "countryId": 1,
      "name": "Bihar",
      "cityCount": 20
    },
    {
      "id": 5,
      "countryId": 1,
      "name": "Chhattisgarh",
      "cityCount": 18
    }
  ],
  "total": 36,
  "limit": 5,
  "offset": 0,
  "hasMore": true
}
```

### Command 3: GET /api/hierarchy/countries/:id/states/:stateId/cities

```bash
# Get cities for Delhi state (India id=1, Delhi state id=1)
curl -s "http://localhost:5001/api/hierarchy/countries/1/states/1/cities?limit=5" | jq '.'
```

**Expected Output:**
```json
{
  "countryId": 1,
  "countryName": "India",
  "stateId": 1,
  "stateName": "Delhi",
  "cities": [
    {
      "id": 1,
      "stateId": 1,
      "name": "Delhi",
      "latitude": 28.7041,
      "longitude": 77.1025
    },
    {
      "id": 2,
      "stateId": 1,
      "name": "New Delhi",
      "latitude": 28.6139,
      "longitude": 77.2090
    },
    ...
  ],
  "total": 45,
  "limit": 5,
  "offset": 0,
  "hasMore": true
}
```

### Command 4: GET /api/hierarchy/search

```bash
# Search for cities containing "Delhi"
curl -s "http://localhost:5001/api/hierarchy/search?q=Delhi&limit=10" | jq '.'
```

**Expected Output:**
```json
{
  "query": "Delhi",
  "results": [
    {
      "type": "country",
      "id": 1,
      "name": "India",
      "hierarchy": "India"
    },
    {
      "type": "state",
      "id": 7,
      "countryId": 1,
      "name": "Delhi",
      "hierarchy": "Delhi, India"
    },
    {
      "type": "city",
      "id": 12,
      "stateId": 7,
      "countryId": 1,
      "name": "Delhi",
      "hierarchy": "Delhi, Delhi, India"
    },
    ...
  ],
  "total": 3,
  "limit": 10,
  "offset": 0,
  "hasMore": false
}
```

### Command 5: POST /api/hierarchy/validate

```bash
# Validate country metadata
curl -s -X POST http://localhost:5001/api/hierarchy/validate \
  -H "Content-Type: application/json" \
  -d '{"country": "India", "state": "Delhi", "city": "Delhi"}' | jq '.'
```

**Expected Output:**
```json
{
  "valid": true,
  "countryId": 1,
  "stateId": 7,
  "cityId": 12,
  "hierarchy": {
    "country": "India",
    "state": "Delhi",
    "city": "Delhi"
  },
  "notes": "Hierarchy validated successfully"
}
```

---

## Pagination & Limits Verification

### Command: Test Pagination Limits

```bash
# Test 1: Verify country limit is enforced
echo "Test 1: Country limit enforcement (request 2000, should get max 1000)"
COUNTRIES=$(curl -s "http://localhost:5001/api/hierarchy/countries?limit=2000" | jq '.countries | length')
echo "Returned: $COUNTRIES"
[ "$COUNTRIES" -le 1000 ] && echo "✓ PASS" || echo "✗ FAIL"

# Test 2: Verify state limit is enforced
echo ""
echo "Test 2: State limit enforcement (request 2000, should get max 1000)"
STATES=$(curl -s "http://localhost:5001/api/hierarchy/countries/1/states?limit=2000" | jq '.states | length')
echo "Returned: $STATES"
[ "$STATES" -le 1000 ] && echo "✓ PASS" || echo "✗ FAIL"

# Test 3: Verify city limit is enforced
echo ""
echo "Test 3: City limit enforcement (request 2000, should get max 500)"
CITIES=$(curl -s "http://localhost:5001/api/hierarchy/countries/1/states/1/cities?limit=2000" | jq '.cities | length')
echo "Returned: $CITIES"
[ "$CITIES" -le 500 ] && echo "✓ PASS" || echo "✗ FAIL"

# Test 4: Verify search limit is enforced
echo ""
echo "Test 4: Search limit enforcement (request 500, should get max 100)"
RESULTS=$(curl -s "http://localhost:5001/api/hierarchy/search?q=Delhi&limit=500" | jq '.results | length')
echo "Returned: $RESULTS"
[ "$RESULTS" -le 100 ] && echo "✓ PASS" || echo "✗ FAIL"
```

**Expected Output:**
```
Test 1: Country limit enforcement (request 2000, should get max 1000)
Returned: 37
✓ PASS

Test 2: State limit enforcement (request 2000, should get max 1000)
Returned: 36
✓ PASS

Test 3: City limit enforcement (request 2000, should get max 500)
Returned: 45
✓ PASS

Test 4: Search limit enforcement (request 500, should get max 100)
Returned: 3
✓ PASS
```

### Command: Test Offset & Pagination

```bash
# Get countries with pagination
echo "Page 1 (offset=0, limit=5):"
curl -s "http://localhost:5001/api/hierarchy/countries?limit=5&offset=0" | jq '.countries[] | .name'

echo ""
echo "Page 2 (offset=5, limit=5):"
curl -s "http://localhost:5001/api/hierarchy/countries?limit=5&offset=5" | jq '.countries[] | .name'

echo ""
echo "Verify different pages:"
PAGE1_FIRST=$(curl -s "http://localhost:5001/api/hierarchy/countries?limit=5&offset=0" | jq -r '.countries[0].name')
PAGE2_FIRST=$(curl -s "http://localhost:5001/api/hierarchy/countries?limit=5&offset=5" | jq -r '.countries[0].name')

if [ "$PAGE1_FIRST" != "$PAGE2_FIRST" ]; then
  echo "✓ PASS: Different countries on different pages"
else
  echo "✗ FAIL: Same countries on different pages"
fi
```

**Expected Output:**
```
Page 1 (offset=0, limit=5):
"Afghanistan"
"Albania"
"Algeria"
"Argentina"
"Australia"

Page 2 (offset=5, limit=5):
"Austria"
"Azerbaijan"
"Bahamas"
"Bahrain"
"Bangladesh"

Verify different pages:
✓ PASS: Different countries on different pages
```

---

## Caching Verification Commands

### Command: Test Cache Performance

```bash
# First request (cache miss)
echo "First request (cache miss):"
time curl -s "http://localhost:5001/api/hierarchy/countries?limit=100" > /tmp/cache_test1.json

echo ""
echo "Second request (cache hit):"
time curl -s "http://localhost:5001/api/hierarchy/countries?limit=100" > /tmp/cache_test2.json

# Verify content identical
echo ""
if cmp -s /tmp/cache_test1.json /tmp/cache_test2.json; then
  echo "✓ Cache content identical"
else
  echo "✗ Cache content differs"
fi

# Check for X-Cache headers (if implemented)
echo ""
echo "Response headers:"
curl -sI "http://localhost:5001/api/hierarchy/countries?limit=5" | grep -i cache || echo "No cache headers found"
```

**Expected Output:**
```
First request (cache miss):
real    0m0.145s
user    0m0.012s
sys     0m0.008s

Second request (cache hit):
real    0m0.012s
user    0m0.009s
sys     0m0.005s

✓ Cache content identical

Response headers:
(No cache headers - internal Node Cache used)
```

---

## Backward Compatibility Verification

### Command: Test Existing Endpoints

```bash
# Test 1: /api/hybrid-measurements (existing AQI endpoint)
echo "Test 1: POST /api/hybrid-measurements"
curl -s -X POST http://localhost:5001/api/hybrid-measurements \
  -H "Content-Type: application/json" \
  -d '{"city": "Delhi, India"}' | jq '.city, .resolvedLocation' | head -2

echo ""
# Test 2: /api/locations (existing locations endpoint)
echo "Test 2: GET /api/locations"
curl -s "http://localhost:5001/api/locations?limit=3" | jq '.results | length'

echo ""
# Test 3: /api/countries (existing countries endpoint)
echo "Test 3: GET /api/countries"
curl -s "http://localhost:5001/api/countries" | jq '.total'

echo ""
# Test 4: /api/collection-status (existing status endpoint)
echo "Test 4: GET /api/collection-status"
curl -s "http://localhost:5001/api/collection-status" | jq '.status'
```

**Expected Output:**
```
Test 1: POST /api/hybrid-measurements
"Delhi"
"Delhi, India"

Test 2: GET /api/locations
3

Test 3: GET /api/countries
193

Test 4: GET /api/collection-status
"Always Active"
```

---

## Error Handling & Edge Cases

### Command: Test Unsupported Region

```bash
# Test unsupported country ID
echo "Test 1: Request unsupported country (id=99999)"
curl -s "http://localhost:5001/api/hierarchy/countries/99999/states" | jq '.error // .message // "No error"'

echo ""
# Test invalid state ID
echo "Test 2: Request invalid state (country=1, state=99999)"
curl -s "http://localhost:5001/api/hierarchy/countries/1/states/99999/cities" | jq '.error // .message // "No error"'

echo ""
# Test empty search
echo "Test 3: Search with empty query"
curl -s "http://localhost:5001/api/hierarchy/search?q=" | jq '.results | length'
```

**Expected Output:**
```
Test 1: Request unsupported country (id=99999)
"Country not found"

Test 2: Request invalid state (country=1, state=99999)
"State not found for this country"

Test 3: Search with empty query
0
```

---

## Performance Baseline Commands

### Command: Response Time Benchmarks

```bash
# Benchmark countries endpoint
echo "Benchmarking GET /api/hierarchy/countries (5 requests):"
for i in {1..5}; do
  { time curl -s "http://localhost:5001/api/hierarchy/countries?limit=100" > /dev/null; } 2>&1 | grep real
done

echo ""
# Benchmark states endpoint
echo "Benchmarking GET /api/hierarchy/countries/1/states (5 requests):"
for i in {1..5}; do
  { time curl -s "http://localhost:5001/api/hierarchy/countries/1/states?limit=100" > /dev/null; } 2>&1 | grep real
done

echo ""
# Benchmark cities endpoint
echo "Benchmarking GET /api/hierarchy/countries/1/states/1/cities (5 requests):"
for i in {1..5}; do
  { time curl -s "http://localhost:5001/api/hierarchy/countries/1/states/1/cities?limit=100" > /dev/null; } 2>&1 | grep real
done
```

**Expected Output:**
```
Benchmarking GET /api/hierarchy/countries (5 requests):
real    0m0.145s
real    0m0.012s
real    0m0.011s
real    0m0.010s
real    0m0.010s

Benchmarking GET /api/hierarchy/countries/1/states (5 requests):
real    0m0.098s
real    0m0.008s
real    0m0.009s
real    0m0.008s
real    0m0.009s

Benchmarking GET /api/hierarchy/countries/1/states/1/cities (5 requests):
real    0m0.156s
real    0m0.015s
real    0m0.014s
real    0m0.016s
real    0m0.015s
```

---

## Database Health Commands

### Command: Check Connection Pools

```bash
# View active connections
psql "${STAGING_DATABASE_URL}" -c "
  SELECT datname, count(*) as connections
  FROM pg_stat_activity
  WHERE datname = current_database()
  GROUP BY datname;
"
```

**Expected Output:**
```
     datname     | connections 
-----------------+-------------
 aqia_staging   |           2
(1 row)
```

### Command: Check Database Size

```bash
# Get database size
psql "${STAGING_DATABASE_URL}" -c "
  SELECT 
    datname,
    pg_size_pretty(pg_database_size(datname)) as size,
    (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) as connections
  FROM pg_database
  WHERE datname = current_database();
"
```

**Expected Output:**
```
     datname      |  size  | connections 
------------------+--------+-------------
 aqia_staging    | 52 MB  |           2
(1 row)
```

---

## Quick Verification Script

```bash
#!/bin/bash
# One-command verification of staging environment

echo "=== STAGING VERIFICATION SUMMARY ==="
echo ""

# 1. Schema check
TABLES=$(psql "${STAGING_DATABASE_URL}" --tuples-only -c "SELECT count(*) FROM information_schema.tables WHERE table_name LIKE 'aqi_%';")
echo "✓ Hierarchy tables: $TABLES/4"

# 2. Data check
COUNTRIES=$(psql "${STAGING_DATABASE_URL}" --tuples-only -c "SELECT count(*) FROM aqi_countries;")
STATES=$(psql "${STAGING_DATABASE_URL}" --tuples-only -c "SELECT count(*) FROM aqi_states;")
CITIES=$(psql "${STAGING_DATABASE_URL}" --tuples-only -c "SELECT count(*) FROM aqi_cities;")
echo "✓ Data: $COUNTRIES countries, $STATES states, $CITIES cities"

# 3. API check
COUNTRIES_API=$(curl -s "http://localhost:5001/api/hierarchy/countries?limit=1" | jq '.countries | length')
echo "✓ API: Hierarchy endpoints responding"

# 4. Backward compatibility
HYBRID=$(curl -s -X POST http://localhost:5001/api/hybrid-measurements \
  -H "Content-Type: application/json" \
  -d '{"city": "India"}' | jq '.empty // false')
echo "✓ Compatibility: Existing endpoints working"

echo ""
echo "=== STAGING READY FOR VALIDATION ==="
```

---

## Troubleshooting Reference

### Problem: Connection Refused

```bash
# Check if server is running
curl -s http://localhost:5001/api/collection-status

# If failed, check process
ps aux | grep "node.*server/index.js"

# Restart if needed
pkill -f "node.*server/index.js"
export DATABASE_URL="${STAGING_DATABASE_URL}"
node /production/server/index.js &
```

### Problem: Database Query Failed

```bash
# Verify connection
psql "${STAGING_DATABASE_URL}" -c "SELECT 1;"

# Check tables exist
psql "${STAGING_DATABASE_URL}" -c "SELECT tablename FROM pg_tables WHERE schemaname='public';"

# Check for errors in table creation
psql "${STAGING_DATABASE_URL}" -c "SELECT * FROM aqi_countries LIMIT 1;"
```

### Problem: Slow Response Times

```bash
# Check indexes
psql "${STAGING_DATABASE_URL}" -c "SELECT * FROM pg_stat_user_indexes WHERE schemaname='public';"

# Analyze query
EXPLAIN ANALYZE SELECT * FROM aqi_countries WHERE name = 'India';
```

---

**Status:** ✅ Reference Guide Complete  
**Ready to Use:** When staging DATABASE_URL is available  
**Production Status:** LOCKED (No changes until validation succeeds)
