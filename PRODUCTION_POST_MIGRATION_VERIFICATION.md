# Production Migration: Post-Execution Verification
**Version:** 1.0  
**Date:** 2026-05-10  
**Purpose:** Verification procedures after migration executes  
**Status:** Ready to use  

---

## Immediate Post-Migration (0-5 minutes)

### Check 1: Migration Command Success

**Look for:**
```
🎉 Done
```

**If you see this:** ✅ Migration completed successfully

**If you see an error:** ❌ Automatic rollback occurred (no changes made)
- Read the error message
- Contact technical support if needed

---

## Server Startup Verification (5-10 minutes after migration)

### Start Server

Terminal 2:
```bash
cd D:\AirQuality_Analytics\server
npm start
```

### Expected Output

```
[dotenv] loading .env
✅ Hierarchy: Loaded 37 countries with coverage data
✅ Neon Database connected
✅ Database tables initialized successfully
✅ Hierarchy API routes mounted at /api/hierarchy/*
Γ£à Server running on http://localhost:5000
```

**All messages show ✅?** → ✅ Server healthy

**Any ❌ or error?**
- Stop server (Ctrl+C)
- Execute rollback (see PRODUCTION_EXECUTION_CHECKLIST_SIMPLE.md)
- Investigate error

---

## Comprehensive API Verification (10-20 minutes after migration)

### Terminal 3: Run 29-Test Suite

**Exact command:**
```bash
cd D:\AirQuality_Analytics\server
$env:API_URL='http://localhost:5000'
node verify_hierarchy_endpoints.js
```

### Expected Output

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

**All 29 tests pass?** → ✅ **MIGRATION SUCCESSFUL!**

**Any tests fail?**
- Note which test failed
- Execute rollback
- Contact technical support with failure details

---

## Manual Smoke Tests (20-30 minutes after migration)

### Test 1: Countries Endpoint

```bash
curl "http://localhost:5000/api/hierarchy/countries?limit=5"
```

**Expected response:**
```json
{
  "countries": [
    {
      "id": 1,
      "country_name": "Argentina",
      "iso2": "AR",
      "coverage_level": "full",
      "aqi_sources": ["waqi"]
    },
    ...
  ]
}
```

**Check:**
- ✅ HTTP 200 OK
- ✅ Returns array with 5 countries
- ✅ Each country has id, country_name, iso2, coverage_level, aqi_sources

### Test 2: Search Endpoint

```bash
curl "http://localhost:5000/api/hierarchy/search?q=India&type=country"
```

**Expected response:**
```json
{
  "results": [
    {
      "type": "country",
      "name": "India",
      "id": 4,
      ...
    }
  ]
}
```

**Check:**
- ✅ HTTP 200 OK
- ✅ India appears in results
- ✅ Type is "country"

### Test 3: Validate Endpoint

```bash
curl -X POST "http://localhost:5000/api/hierarchy/validate"
```

**Expected response:**
```json
{
  "status": "ok",
  "timestamp": "2026-05-10T...",
  "metadata": {
    "totalCountries": 37,
    "totalStates": 40,
    "totalCities": 14950,
    "cacheReady": true,
    "malformedEntries": 0,
    "hierarchySource": "db"
  }
}
```

**Check:**
- ✅ HTTP 200 OK
- ✅ totalCountries: 37
- ✅ totalStates: 40
- ✅ totalCities: ~14,950
- ✅ malformedEntries: 0
- ✅ hierarchySource: "db"

### Test 4: Backward Compatibility - Manual Search

```bash
curl "http://localhost:5000/api/hybrid-measurements?city=Delhi"
```

**Expected response:**
```json
{
  "location": "Delhi",
  "measurements": [...]
}
```

**Check:**
- ✅ HTTP 200 OK
- ✅ Original API still works
- ✅ Manual search functional

---

## Database Verification (30-40 minutes after migration)

### Connect to Production Database

```bash
# Using psql if available
psql "postgresql://neondb_owner:npg_niB5kMYNaDw6@ep-proud-butterfly-a13dejfe-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Or using node connection script
```

### Query 1: Table Existence

```sql
SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'aqi_%' ORDER BY tablename;
```

**Expected output:**
```
aqi_cities
aqi_countries
aqi_hierarchy_cache
aqi_states
```

**Check:** ✅ All 4 tables present

### Query 2: Row Counts

```sql
SELECT 'aqi_countries' as table_name, COUNT(*) as count FROM aqi_countries
UNION ALL
SELECT 'aqi_states', COUNT(*) FROM aqi_states
UNION ALL
SELECT 'aqi_cities', COUNT(*) FROM aqi_cities
UNION ALL
SELECT 'aqi_hierarchy_cache', COUNT(*) FROM aqi_hierarchy_cache;
```

**Expected output:**
```
aqi_countries       | 37
aqi_states          | 40
aqi_cities          | 14950 (approximately)
aqi_hierarchy_cache | 37
```

**Check:**
- ✅ aqi_countries: 37
- ✅ aqi_states: 40
- ✅ aqi_cities: ~14,950
- ✅ aqi_hierarchy_cache: 37

### Query 3: Malformed Data Check

```sql
SELECT COUNT(*) FROM aqi_countries WHERE country_name ~ '^\d+$' OR country_name IN ('0','1','2');
```

**Expected output:**
```
0
```

**Check:** ✅ Zero malformed entries

### Query 4: Sample Countries

```sql
SELECT country_name, iso2, coverage_level FROM aqi_countries ORDER BY country_name LIMIT 5;
```

**Expected output:**
```
country_name | iso2 | coverage_level
Argentina    | AR   | full
Australia    | AU   | full
Brazil       | BR   | full
Canada       | CA   | full
Chile        | CL   | full
```

**Check:**
- ✅ All country names are legitimate (no "0", "1", "2")
- ✅ ISO codes are valid 2-letter codes
- ✅ Coverage levels present

---

## Verification Checklist ✅

### After All Tests Complete

- [ ] Migration command completed: "🎉 Done"
- [ ] Server started: All ✅ messages
- [ ] 29 API tests passing: 29/29 ✅
- [ ] Test 1 (Countries): 200 OK, 5 countries returned
- [ ] Test 2 (Search): 200 OK, India found
- [ ] Test 3 (Validate): 200 OK, metadata correct
- [ ] Test 4 (Backward compat): 200 OK, manual search works
- [ ] Query 1: All 4 tables present
- [ ] Query 2: Row counts correct (37/40/14950/37)
- [ ] Query 3: Zero malformed entries
- [ ] Query 4: Sample countries valid

**All checked?** → **✅ PRODUCTION MIGRATION VERIFIED AND SUCCESSFUL!**

---

## Post-Verification Actions

### 1. Monitor for 24 Hours

Keep server running and monitor:
- Every 15 min (first 2 hours): Server still running?
- Every 30 min (hours 2-8): Response times normal? Any errors?
- Every 2 hours (hours 8-24): System stable?

### 2. Frontend Integration (When Ready)

Currently paused. To activate (future step):
- Update frontend to use `/api/hierarchy/*` endpoints
- Keep `/api/hybrid-measurements` as fallback
- Deploy frontend changes
- Monitor frontend + backend together

### 3. Document Results

Record:
```
Migration Date/Time: ___________________
Migration Duration: ___________________
Test Results: 29/29 ✅
Database Verification: ✅
Final Status: ✅ SUCCESS

Production Data:
- Countries: 37
- States: 40
- Cities: ~14,950
- Malformed Entries: 0
- Cache Entries: 37

Issue: None / [describe]
Notes: ___________________
```

---

## If Verification Fails

### Automatic Rollback Already Occurred

If any test fails:
- Database transactions automatically rolled back
- No partial state left behind
- Production is safe (unchanged)

### Execute Manual Rollback

If needed (unlikely):

```sql
DROP TABLE IF EXISTS aqi_hierarchy_cache CASCADE;
DROP TABLE IF EXISTS aqi_cities CASCADE;
DROP TABLE IF EXISTS aqi_states CASCADE;
DROP TABLE IF EXISTS aqi_countries CASCADE;
DROP VIEW IF EXISTS aqi_coverage_summary CASCADE;
```

### Restore From Backup

If rollback doesn't work:
1. Go to https://console.neon.tech
2. Backups → Find `pre-hierarchy-migration-2026-05-10`
3. Restore to main branch
4. Wait 5-15 minutes
5. Production restored

---

## Troubleshooting

### Issue: 29 tests don't all pass

**Solution:**
- Note which test failed (e.g., "Test Suite 2 - 4/5 passed")
- Check API logs for errors
- Execute rollback
- Contact technical support with test results

### Issue: Malformed data found (Query 3 returns > 0)

**Solution:**
- This indicates cleanup didn't work as expected
- Execute rollback
- Investigate cleanup procedures
- Retry migration with manual cleanup

### Issue: Row counts don't match expected

**Solution:**
- Verify coverage map wasn't corrupted
- Execute rollback
- Contact technical support

### Issue: Server won't start

**Solution:**
- Check error messages
- Verify DATABASE_URL is set correctly
- Restart server
- If persists, execute rollback

---

## Success Summary

**Once all verifications pass:** ✅

- ✅ Schema created (4 tables + 1 view)
- ✅ Data populated (37 countries, correct hierarchy)
- ✅ Cache generated (37 entries)
- ✅ All 29 tests passing
- ✅ Zero malformed data
- ✅ APIs responding correctly
- ✅ Backward compatibility maintained
- ✅ Ready for production use

**Production migration is complete and verified!**

---

**Next Step (Optional, Future):**
Frontend integration activation (when business ready)
Currently: Integration remains paused

---

**Status:** ✅ Ready for post-migration verification  
**Used After:** Migration completes  
**Expected Duration:** ~30 minutes for all verifications  
**Success Indicator:** 29/29 tests passing + all manual checks OK
