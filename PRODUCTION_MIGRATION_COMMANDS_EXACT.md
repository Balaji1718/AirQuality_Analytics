# Production Migration: Exact Execution Commands
**Version:** 1.0  
**Date:** 2026-05-10  
**Scope:** Solo deployment - Copy/paste ready  
**Status:** Ready to execute when approved  

---

## Pre-Execution Requirements ✅

- ✅ Production backup created (BACKUP_CREATION_SIMPLE.md)
- ✅ Staging validation complete (29/29 tests)
- ✅ Dry-run successful (no changes made)
- ✅ Frontend integration paused
- ✅ Rollback procedures documented

---

## EXACT PRODUCTION MIGRATION COMMANDS

### Terminal 1: Execute Real Migration

**Copy this EXACTLY (all one command block):**

```bash
cd D:\AirQuality_Analytics\server
$env:DATABASE_URL='postgresql://neondb_owner:npg_niB5kMYNaDw6@ep-proud-butterfly-a13dejfe-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
node apply_hierarchy_migration_and_populate.js --apply --target=production
```

**What to expect:**
```
▶️ Applying hierarchical migration and populating data...
⚠️ Coverage map contains invalid country keys that will be skipped: [ '0', '1', '2' ]
Applying migration SQL...
✅ Migration applied
Populating hierarchy tables from coverage map...
Inserting country: Argentina (aqi_id: 1)
Inserting country: Australia (aqi_id: 2)
[... more countries ...]
Inserting country: Yemen (aqi_id: 37)
✅ Hierarchy population complete
Generating hierarchy cache entries...
✅ Hierarchy cache generated
🎉 Done
```

**Duration:** 30-45 minutes

**Result indicator:** If you see "🎉 Done" at the end → ✅ Success!

---

### Terminal 2: Start Production Server (After Migration)

**Once migration completes, run:**

```bash
cd D:\AirQuality_Analytics\server
npm start
```

**Expected output:**
```
[dotenv] loading .env
✅ Hierarchy: Loaded 37 countries with coverage data
✅ Neon Database connected
✅ Database tables initialized successfully
✅ Hierarchy API routes mounted at /api/hierarchy/*
Γ£à Server running on http://localhost:5000
```

**Keep this terminal running** for verification (don't close it).

---

### Terminal 3: Run Verification Suite (While server running)

**Open a NEW terminal and run:**

```bash
cd D:\AirQuality_Analytics\server
$env:API_URL='http://localhost:5000'
node verify_hierarchy_endpoints.js
```

**Expected output:**
```
HIERARCHY ENDPOINTS VERIFICATION TESTS
Test Suite 1: GET /api/hierarchy/countries – 6/6 ✅
Test Suite 2: GET /api/hierarchy/countries/:countryId/states – 5/5 ✅
Test Suite 3: GET /api/hierarchy/countries/:countryId/states/:stateId/cities – 6/6 ✅
Test Suite 4: GET /api/hierarchy/search – 6/6 ✅
Test Suite 5: POST /api/hierarchy/validate – 3/3 ✅
Test Suite 6: Isolation & Backward Compatibility – 3/3 ✅
TESTS COMPLETE: 29/29 passed ✅
```

**Result:** If you see "29/29 passed ✅" → ✅ Production migration succeeded!

---

## Verification Commands (After Migration)

### Quick API Verification (Terminal 3)

Test 1: List countries
```bash
curl "http://localhost:5000/api/hierarchy/countries?limit=3"
```
Expected: 200 OK, JSON with 3 countries

Test 2: Search for India
```bash
curl "http://localhost:5000/api/hierarchy/search?q=India&type=country"
```
Expected: 200 OK, India in results

Test 3: Validate endpoint
```bash
curl -X POST "http://localhost:5000/api/hierarchy/validate"
```
Expected: 200 OK, metadata with timestamp

Test 4: Manual search (backward compatibility)
```bash
curl "http://localhost:5000/api/hybrid-measurements?city=Delhi"
```
Expected: 200 OK, manual search still working

All 4 tests return 200 OK? → ✅ **Migration successful!**

---

## If Migration Fails: Rollback Commands

### Automatic Rollback (Already Happened If Migration Failed)

If migration command failed:
- Database automatically rolled back
- Production is safe (unchanged)
- Can retry migration

No action needed. Production is protected.

### Manual Rollback (If Needed)

Connect to production database and run:

```sql
DROP TABLE IF EXISTS aqi_hierarchy_cache CASCADE;
DROP TABLE IF EXISTS aqi_cities CASCADE;
DROP TABLE IF EXISTS aqi_states CASCADE;
DROP TABLE IF EXISTS aqi_countries CASCADE;
DROP VIEW IF EXISTS aqi_coverage_summary CASCADE;
```

Production restored to pre-migration state.

### Emergency Rollback: Restore From Backup

1. Go to https://console.neon.tech
2. Select your project → Backups
3. Find `pre-hierarchy-migration-2026-05-10`
4. Click Restore → Choose "main" → Confirm
5. Wait 5-15 minutes
6. ✅ Production restored from backup

---

## Database Verification Commands

### Check Migration Success

Run these to verify production state:

```sql
-- Count new tables
SELECT COUNT(*) FROM aqi_countries;
-- Expected: 37

SELECT COUNT(*) FROM aqi_states;
-- Expected: 40

SELECT COUNT(*) FROM aqi_cities;
-- Expected: ~14,950

SELECT COUNT(*) FROM aqi_hierarchy_cache;
-- Expected: 37

-- Check for malformed entries
SELECT COUNT(*) FROM aqi_countries WHERE country_name ~ '^\d+$';
-- Expected: 0

-- Sample valid countries
SELECT country_name, iso2 FROM aqi_countries LIMIT 5;
-- Expected: 5 legitimate country names
```

All queries return expected results? → ✅ **Migration verified!**

---

## Complete Execution Flow (Copy & Paste Order)

### 1. Start Migration (Terminal 1)

```bash
cd D:\AirQuality_Analytics\server
$env:DATABASE_URL='postgresql://neondb_owner:npg_niB5kMYNaDw6@ep-proud-butterfly-a13dejfe-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
node apply_hierarchy_migration_and_populate.js --apply --target=production
```

Wait for: `🎉 Done`

### 2. Start Server (Terminal 2)

```bash
cd D:\AirQuality_Analytics\server
npm start
```

Wait for: `Server running on http://localhost:5000`

### 3. Run Verification (Terminal 3)

```bash
cd D:\AirQuality_Analytics\server
$env:API_URL='http://localhost:5000'
node verify_hierarchy_endpoints.js
```

Wait for: `29/29 passed ✅`

### 4. Verify APIs Manually (Terminal 3)

```bash
curl "http://localhost:5000/api/hierarchy/countries?limit=3"
curl "http://localhost:5000/api/hierarchy/search?q=India&type=country"
curl -X POST "http://localhost:5000/api/hierarchy/validate"
curl "http://localhost:5000/api/hybrid-measurements?city=Delhi"
```

All return 200? → **✅ SUCCESS!**

---

## Key Timeline

| Step | Duration | Terminal | Command |
|------|----------|----------|---------|
| 1. Migration | 30-45 min | 1 | `--apply --target=production` |
| 2. Server start | 2 min | 2 | `npm start` |
| 3. Verification | 5 min | 3 | `verify_hierarchy_endpoints.js` |
| 4. Smoke tests | 3 min | 3 | 4x curl commands |
| **Total** | **~50 min** | | |

---

## Status: ✅ READY

All commands are prepared and ready to copy/paste.

**Waiting for:** Your explicit approval to execute.

**When approved, execute in order:**

**Terminal 1:**
```bash
cd D:\AirQuality_Analytics\server
$env:DATABASE_URL='postgresql://neondb_owner:npg_niB5kMYNaDw6@ep-proud-butterfly-a13dejfe-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
node apply_hierarchy_migration_and_populate.js --apply --target=production
```

**Then Terminal 2, then Terminal 3** (as documented above).

---

**Production database is backed up and ready. Frontend integration remains paused. All safeguards active.**
