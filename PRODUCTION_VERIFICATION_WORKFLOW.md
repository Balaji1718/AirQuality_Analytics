# Production Verification Workflow
**Version:** 1.0  
**Date:** 2026-05-10  
**Purpose:** Step-by-step verification after production migration executes  

---

## Overview

After production migration completes, this workflow validates that all changes were applied correctly and the system is ready for frontend activation.

**Total Time:** ~15 minutes  
**Success Criteria:** All steps pass ✅  
**Failure Action:** Proceed to Rollback Procedure

---

## Phase 1: Database Schema Verification (3 minutes)

### Step 1.1: Connect to Production Database

```bash
# Using psql:
psql "postgresql://neondb_owner:npg_niB5kMYNaDw6@ep-proud-butterfly-a13dejfe-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Or verify via production server:
$env:DATABASE_URL='postgresql://neondb_owner:...@ep-proud-butterfly-...neondb'
```

### Step 1.2: Verify New Tables Created

```sql
-- List all tables
\dt

-- Expected output should include:
-- aqi_cities
-- aqi_countries
-- aqi_hierarchy_cache
-- aqi_states
-- aqi_coverage_summary (view)
```

**Verification Checklist:**
- [ ] aqi_countries table exists
- [ ] aqi_states table exists
- [ ] aqi_cities table exists
- [ ] aqi_hierarchy_cache table exists
- [ ] aqi_coverage_summary view exists
- [ ] Original tables still exist (aqi_measurements, aqi_locations, etc.)

### Step 1.3: Verify Indexes Created

```sql
-- Check indexes
SELECT indexname FROM pg_indexes 
WHERE schemaname = 'public' AND tablename LIKE 'aqi_%'
ORDER BY tablename, indexname;

-- Expected indexes:
-- idx_country_coverage
-- idx_country_sources
-- idx_country_iso2
-- idx_state_country
-- idx_state_coverage
-- idx_city_country
-- idx_city_state
-- idx_city_has_data
-- idx_city_sources
-- idx_city_location
-- idx_cache_country
```

**Verification Checklist:**
- [ ] All expected indexes present
- [ ] No duplicate indexes
- [ ] Index creation successful

### Step 1.4: Check Table Sizes

```sql
-- Check row counts for new tables
SELECT 
  'aqi_countries' as table_name, COUNT(*) as row_count FROM aqi_countries
UNION ALL
SELECT 'aqi_states', COUNT(*) FROM aqi_states
UNION ALL
SELECT 'aqi_cities', COUNT(*) FROM aqi_cities
UNION ALL
SELECT 'aqi_hierarchy_cache', COUNT(*) FROM aqi_hierarchy_cache;

-- Expected (based on staging baseline):
-- aqi_countries: 37
-- aqi_states: 40
-- aqi_cities: ~14,950
-- aqi_hierarchy_cache: 37
```

**Verification Checklist:**
- [ ] aqi_countries: 37 ± 2 rows
- [ ] aqi_states: 40 ± 2 rows
- [ ] aqi_cities: 14,900 - 15,000 rows
- [ ] aqi_hierarchy_cache: 37 ± 2 rows

### Step 1.5: Verify Data Quality

```sql
-- Check for malformed countries (numeric-only names)
SELECT country_name FROM aqi_countries 
WHERE country_name ~ '^\d+$' OR country_name IN ('0','1','2');

-- Expected: No results (0 rows)

-- Check sample countries (should all be alphabetic)
SELECT country_name, iso2, coverage_level 
FROM aqi_countries 
ORDER BY country_name 
LIMIT 5;

-- Expected sample: France, Guyana, India, Indonesia, Kenya
```

**Verification Checklist:**
- [ ] Malformed countries found: 0
- [ ] All country names contain letters
- [ ] Sample country names verified as legitimate
- [ ] Coverage levels populated (full/partial/minimal)

---

## Phase 2: Data Integrity Verification (2 minutes)

### Step 2.1: Verify Referential Integrity

```sql
-- Check for orphaned states (state with country_id not in aqi_countries)
SELECT COUNT(*) FROM aqi_states s
WHERE s.country_id NOT IN (SELECT id FROM aqi_countries);

-- Expected: 0 (no orphans)

-- Check for orphaned cities (city with country_id not in aqi_countries)
SELECT COUNT(*) FROM aqi_cities c
WHERE c.country_id NOT IN (SELECT id FROM aqi_countries);

-- Expected: 0 (no orphans)

-- Check for orphaned cache entries
SELECT COUNT(*) FROM aqi_hierarchy_cache hc
WHERE hc.country_id NOT IN (SELECT id FROM aqi_countries);

-- Expected: 0 (no orphans)
```

**Verification Checklist:**
- [ ] No orphaned states: 0 rows
- [ ] No orphaned cities: 0 rows
- [ ] No orphaned cache entries: 0 rows
- [ ] Referential integrity verified

### Step 2.2: Verify Cache Generation

```sql
-- Check that cache was generated with hierarchy_json populated
SELECT country_id, generated_at, query_count 
FROM aqi_hierarchy_cache 
LIMIT 5;

-- Expected:
-- generated_at: Recent timestamp (within migration window)
-- query_count: 0 (not queried yet)
-- All 37 countries have cache entries
```

**Verification Checklist:**
- [ ] Cache entries have timestamps (not null)
- [ ] Cache JSON is valid (no parse errors)
- [ ] All 37 countries cached
- [ ] Query counts initialized to 0

### Step 2.3: Verify View Creation

```sql
-- Check coverage summary view
SELECT COUNT(*) FROM aqi_coverage_summary;

-- Expected: 37 (matches countries with data)

SELECT * FROM aqi_coverage_summary LIMIT 3;

-- Expected output format:
-- id | country_name | iso2 | coverage_level | aqi_sources | region_count | city_count | latest_data
```

**Verification Checklist:**
- [ ] View query succeeds (no errors)
- [ ] Returns 37 rows (matches countries)
- [ ] All columns populated correctly
- [ ] Coverage_level shows valid values

---

## Phase 3: Production API Server Startup (3 minutes)

### Step 3.1: Start Production Server

```bash
cd server
$env:DATABASE_URL='postgresql://neondb_owner:npg_niB5kMYNaDw6@ep-proud-butterfly-a13dejfe-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
$env:PORT=5000
npm start

# Expected output:
# [dotenv] loading .env
# ✅ Hierarchy: Loaded 37 countries with coverage data
# ✅ Loaded 193 countries from database
# ✅ Loaded coverage map with 193 entries
# ✅ Loaded regional coverage for 193 countries
# ⏰ Automatic data collection scheduled
# 🌐 Starting BreatheSmart Air Quality Server
# ✅ Neon Database connected
# ✅ Database tables initialized successfully
# ✅ Hierarchy API routes mounted at /api/hierarchy/*
# Γ£à Server running on http://localhost:5000
```

**Verification Checklist:**
- [ ] Server started successfully
- [ ] Database connected
- [ ] Hierarchy routes mounted
- [ ] No errors in startup logs
- [ ] Server listening on port 5000

### Step 3.2: Verify Server Health Endpoint (if available)

```bash
curl http://localhost:5000/api/health

# Expected: 200 OK with status json
```

**Verification Checklist:**
- [ ] Health endpoint responds
- [ ] Status shows connected
- [ ] No critical errors

---

## Phase 4: Hierarchy API Verification (6 minutes)

### Step 4.1: Run Complete Verification Test Suite

```bash
# Terminal 2 (while server running in Terminal 1)
cd server
$env:API_URL='http://localhost:5000'
node verify_hierarchy_endpoints.js

# Expected output:
# HIERARCHY ENDPOINTS VERIFICATION TESTS
# Test Suite 1: GET /api/hierarchy/countries – 6/6 ✅
# Test Suite 2: GET /api/hierarchy/.../states – 5/5 ✅
# Test Suite 3: GET /api/hierarchy/.../cities – 6/6 ✅
# Test Suite 4: GET /api/hierarchy/search – 6/6 ✅
# Test Suite 5: POST /api/hierarchy/validate – 3/3 ✅
# Test Suite 6: Isolation & Backward Compatibility – 3/3 ✅
# TESTS COMPLETE: 29/29 passed ✅
```

**Verification Checklist:**
- [ ] All 29 tests passing
- [ ] No test failures
- [ ] No timeout errors
- [ ] Response times normal (<500ms per test)

### Step 4.2: Manual Smoke Tests

#### Test 1: Countries Endpoint
```bash
curl "http://localhost:5000/api/hierarchy/countries?limit=5"

# Expected:
# 200 OK
# JSON with countries array
# Each country has: id, country_name, iso2, coverage_level, aqi_sources
# Sample: { id: 1, country_name: "France", iso2: "FR", ... }
```

**Verification:**
- [ ] Responds with 200 OK
- [ ] Returns valid JSON
- [ ] 5 countries returned (limit=5)
- [ ] All fields present

#### Test 2: States for a Country
```bash
# First, get a valid country ID from test 1 (e.g., id: 4 = India)
curl "http://localhost:5000/api/hierarchy/countries/4/states"

# Expected:
# 200 OK
# JSON with states array
# Each state has: id, state_name, city_count, aqi_sources
```

**Verification:**
- [ ] Responds with 200 OK
- [ ] Returns valid JSON
- [ ] States listed for country
- [ ] All fields present

#### Test 3: Cities for a State
```bash
# Using country 4 (India), state 1
curl "http://localhost:5000/api/hierarchy/countries/4/states/1/cities?limit=5"

# Expected:
# 200 OK
# JSON with cities array
# Each city has: id, city_name, latitude, longitude, aqi_sources
```

**Verification:**
- [ ] Responds with 200 OK
- [ ] Returns valid JSON
- [ ] 5 cities returned
- [ ] Coordinates are numeric

#### Test 4: Search Endpoint
```bash
curl "http://localhost:5000/api/hierarchy/search?q=India&type=country"

# Expected:
# 200 OK
# JSON with search results
# Returns: [{ name: "India", type: "country", ... }]
```

**Verification:**
- [ ] Responds with 200 OK
- [ ] Returns valid JSON
- [ ] Correct search result
- [ ] Type filter working

#### Test 5: Validate Endpoint
```bash
curl -X POST "http://localhost:5000/api/hierarchy/validate"

# Expected:
# 200 OK
# JSON with validation metadata
# { status: "ok", timestamp: "...", metadata: { totalCountries: 37, ... } }
```

**Verification:**
- [ ] Responds with 200 OK
- [ ] Returns valid JSON
- [ ] Timestamp present
- [ ] Metadata shows: totalCountries=37

---

## Phase 5: Backward Compatibility Verification (1 minute)

### Step 5.1: Verify Existing APIs Unaffected

```bash
# Test original manual search (should still work)
curl "http://localhost:5000/api/hybrid-measurements?city=Delhi"

# Expected:
# 200 OK
# Original API response unchanged
# Manual search functionality intact
```

**Verification Checklist:**
- [ ] Responds with 200 OK
- [ ] Returns original format
- [ ] No new errors introduced

### Step 5.2: Verify Historical Data Endpoint

```bash
curl "http://localhost:5000/api/historical?city=Delhi&date_from=2025-01-01"

# Expected:
# 200 OK
# Historical data returned
# Original functionality intact
```

**Verification Checklist:**
- [ ] Responds with 200 OK
- [ ] Returns historical data
- [ ] Date filtering works

---

## Phase 6: Performance Verification (1 minute)

### Step 6.1: Response Time Check

```bash
# Test response time for cached endpoints
time curl "http://localhost:5000/api/hierarchy/countries"

# Expected: Real <100ms (cache hit)

# Test response time for second request (should be faster)
time curl "http://localhost:5000/api/hierarchy/countries"

# Expected: Real <50ms (cache hit)
```

**Verification Checklist:**
- [ ] First request: <500ms
- [ ] Cached requests: <100ms
- [ ] No timeout errors
- [ ] Consistent response times

### Step 6.2: Database Query Performance

```sql
-- Check query performance
EXPLAIN ANALYZE SELECT * FROM aqi_countries LIMIT 10;

-- Expected:
-- Seq Scan on aqi_countries (cost: ~1.00)
-- No warnings or errors
-- Execution time: <1ms
```

**Verification Checklist:**
- [ ] Query plan efficient
- [ ] No sequential scans on large tables
- [ ] Indexes being used
- [ ] Execution time <1ms

---

## Final Sign-Off

### Verification Complete Checklist

- [ ] Phase 1: Database schema verified (5 new objects)
- [ ] Phase 2: Data integrity verified (no orphans, 37 countries)
- [ ] Phase 3: Production server started (no errors)
- [ ] Phase 4: All 29 API tests passing
- [ ] Phase 5: Existing APIs still working
- [ ] Phase 6: Performance acceptable

### Production Verification Status

```
Date/Time Completed: ___________________
Verified By: ___________________
All Tests Passed: ✅ Yes / ❌ No

Issues Found: None / [list issues]
Rollback Required: No / Yes
```

### Approval to Proceed

- [ ] **Technical Lead:** Production verification approved
  - Signature: _________________________
  - Time: _________________________

- [ ] **On-Call Engineer:** Production stable, monitoring active
  - Signature: _________________________
  - Time: _________________________

---

## If Issues Found

### Issue Resolution Flowchart

```
Issue Found?
├─ Minor (non-blocking):
│  ├─ Log in incident tracker
│  ├─ Plan fix for next sprint
│  └─ Continue with monitoring
│
├─ Critical (blocking):
│  ├─ Document exact error
│  ├─ Identify root cause
│  ├─ Proceed to PRODUCTION_ROLLBACK_PROCEDURE.md
│  └─ Execute appropriate rollback level
│
└─ Unclear:
   ├─ Capture logs and screenshots
   ├─ Contact technical lead
   └─ Escalate if needed
```

### Logs to Collect (If Issues Found)

```bash
# Application logs (last 100 lines)
tail -100 server.log > /tmp/production_error_logs.txt

# Database error logs (if available)
# via Neon dashboard: Logs section

# API response logs
# Any failed test output

# Store in: /tmp/production_error_logs.txt
# Share with: Technical lead, DBA
```

---

**Workflow Status:** ⏳ Ready to Execute / ✅ Completed  
**Next Step:** Proceed to production monitoring (PRODUCTION_MONITORING_PLAN.md)
