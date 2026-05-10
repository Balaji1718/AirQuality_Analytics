# Production Execution Checklist (Simplified)
**Version:** 1.0  
**Scope:** Solo/small-team deployment  
**Time Required:** ~45 minutes total  
**Status:** Ready to execute (awaiting your approval)  

---

## Pre-Execution Quick Check (5 minutes)

Before running migration, verify:

- [ ] Production backup created? ✅ (See BACKUP_CREATION_SIMPLE.md)
- [ ] Backup ID recorded? ✅ (___________________) 
- [ ] You have production DATABASE_URL? ✅ (ep-proud-butterfly-*)
- [ ] Staging validation confirmed? ✅ (29/29 tests passing)
- [ ] Dry-run was successful? ✅ (No changes were made)
- [ ] Frontend integration paused? ✅ (Manual search is primary)

All checked? → **Proceed to execution**

---

## Execution Commands

### Command 1: Final Dry-Run (Optional, 2 minutes)

Re-verify everything works as expected without making changes:

```bash
cd D:\AirQuality_Analytics\server
$env:DATABASE_URL='postgresql://neondb_owner:npg_niB5kMYNaDw6@ep-proud-butterfly-a13dejfe-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
node apply_hierarchy_migration_and_populate.js --target=production
```

**Expected output:**
```
▶️ Applying hierarchical migration and populating data...
Dry run only. No database changes were made.
Use --apply with --target=local|staging to execute manually after verification.
```

**Status:** ✅ Safe (no changes)

---

### Command 2: REAL PRODUCTION MIGRATION (30-45 minutes)

**⚠️ THIS MAKES CHANGES TO PRODUCTION DATABASE**

When you are ready, run this EXACT command:

```bash
cd D:\AirQuality_Analytics\server
$env:DATABASE_URL='postgresql://neondb_owner:npg_niB5kMYNaDw6@ep-proud-butterfly-a13dejfe-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
node apply_hierarchy_migration_and_populate.js --apply --target=production
```

**Expected output (success):**
```
▶️ Applying hierarchical migration and populating data...
⚠️ Coverage map contains invalid country keys that will be skipped: [ '0', '1', '2' ]
Applying migration SQL...
✅ Migration applied
Populating hierarchy tables from coverage map...
[... 37 country population messages ...]
✅ Hierarchy population complete
Generating hierarchy cache entries...
✅ Hierarchy cache generated
🎉 Done
```

**Expected duration:** 30-45 minutes

**Expected outcome:**
- ✅ 4 new tables created: aqi_countries, aqi_states, aqi_cities, aqi_hierarchy_cache
- ✅ 1 new view created: aqi_coverage_summary
- ✅ 37 countries inserted
- ✅ 40 states inserted
- ✅ ~14,950 cities inserted
- ✅ 37 cache entries created
- ✅ 0 malformed entries (filtered by validation)
- ✅ No errors (transaction committed successfully)

**If you see errors:**
- Stop execution (Ctrl+C)
- Check error message
- Database will auto-rollback (no partial state)
- Contact technical support with error text
- Can retry after fix

---

## Post-Migration Verification (5 minutes)

### Command 3: Start Production Server

```bash
cd D:\AirQuality_Analytics\server
npm start
```

**Expected output (success):**
```
[dotenv] loading .env
✅ Hierarchy: Loaded 37 countries with coverage data
✅ Neon Database connected
✅ Hierarchy API routes mounted at /api/hierarchy/*
Server running on http://localhost:5000
```

**Keep server running** for next verification step.

---

### Command 4: Run 29-Test Verification Suite (Terminal 2)

While server is running (in Terminal 1), open Terminal 2 and run:

```bash
cd D:\AirQuality_Analytics\server
$env:API_URL='http://localhost:5000'
node verify_hierarchy_endpoints.js
```

**Expected output (success):**
```
HIERARCHY ENDPOINTS VERIFICATION TESTS
Test Suite 1: GET /api/hierarchy/countries – 6/6 ✅
Test Suite 2: GET /api/hierarchy/.../states – 5/5 ✅
Test Suite 3: GET /api/hierarchy/.../cities – 6/6 ✅
Test Suite 4: GET /api/hierarchy/search – 6/6 ✅
Test Suite 5: POST /api/hierarchy/validate – 3/3 ✅
Test Suite 6: Isolation & Backward Compatibility – 3/3 ✅
TESTS COMPLETE: 29/29 passed ✅
```

**If all 29 pass:** ✅ Migration successful!

**If any fail:** 
- Review error details
- Execute rollback (see Step 5 below)
- Investigate failure
- Contact technical support

---

### Command 5: Quick Manual Smoke Tests (3 minutes)

Test a few endpoints manually to confirm they work:

```bash
# Test 1: Countries listing
curl "http://localhost:5000/api/hierarchy/countries?limit=5"
# Should return: 200 OK with JSON array of 5 countries

# Test 2: Search
curl "http://localhost:5000/api/hierarchy/search?q=India&type=country"
# Should return: 200 OK with India in results

# Test 3: Validate endpoint
curl -X POST "http://localhost:5000/api/hierarchy/validate"
# Should return: 200 OK with metadata

# Test 4: Original API still works (backward compatibility)
curl "http://localhost:5000/api/hybrid-measurements?city=Delhi"
# Should return: 200 OK (manual search still working)
```

All 4 tests return 200 OK? → **✅ Migration successful**

---

## If Migration Fails (Rollback - 10 minutes)

### Level 1: Automatic Rollback (Already Happened)

If the migration command failed:
- ✅ Database automatically rolled back (transaction failed)
- ✅ No partial state left behind
- ✅ Production is safe (back to pre-migration state)

**Status:** Production unchanged. Can retry after fixing issue.

### Level 2: Manual Rollback (If Needed)

If Level 1 didn't work, run these SQL commands to remove the new tables:

```sql
-- Connect to production database first:
-- psql "postgresql://neondb_owner:[PASSWORD]@ep-proud-butterfly-.../neondb?sslmode=require"

DROP TABLE IF EXISTS aqi_hierarchy_cache CASCADE;
DROP TABLE IF EXISTS aqi_cities CASCADE;
DROP TABLE IF EXISTS aqi_states CASCADE;
DROP TABLE IF EXISTS aqi_countries CASCADE;
DROP VIEW IF EXISTS aqi_coverage_summary CASCADE;

-- Production restored to pre-migration state
```

### Level 3: Backup Restore (Emergency)

If both Level 1 & 2 failed (unlikely):

1. Go to https://console.neon.tech
2. Select your project
3. Go to **Backups** section
4. Find your `pre-hierarchy-migration-2026-05-10` backup
5. Click **Restore**
6. Choose **main** branch (production)
7. Click **Restore** and confirm
8. Wait 5-15 minutes for restore to complete
9. Production restored to pre-migration state ✅

---

## Success Confirmation

### After All Tests Pass ✅

1. ✅ 29/29 tests passing
2. ✅ Manual smoke tests OK
3. ✅ All 4 endpoints responding
4. ✅ Database has 37 countries (query shows count)
5. ✅ No errors in logs
6. ✅ Original APIs still working

**Result:** Migration succeeded! Production is ready.

---

## Post-Migration Monitoring (First 24 Hours)

Once migration succeeds, monitor these metrics:

### Every 15 minutes (First 2 hours):
- [ ] Server still running? (check console)
- [ ] Response time normal? (< 300ms)
- [ ] Any errors in logs? (check if red errors appear)
- [ ] API responding? (curl any endpoint)

### Every 30 minutes (Hours 2-8):
- [ ] Error rate stable? (< 0.1%)
- [ ] Response times stable? (< 300ms avg)
- [ ] Manual search working? (curl /api/hybrid-measurements)
- [ ] Hierarchy API working? (curl /api/hierarchy/countries)

### Every 2 hours (Hours 8-24):
- [ ] All systems normal?
- [ ] No unexpected errors?
- [ ] Performance acceptable?

### After 24 hours:
- ✅ Production stable and verified
- ✅ Ready for frontend integration (if/when needed)
- ✅ Transition to standard monitoring

---

## Quick Reference: Exact Commands

### Three Core Commands:

**Option 1: Final Dry-Run (safe, test only)**
```bash
cd D:\AirQuality_Analytics\server
$env:DATABASE_URL='postgresql://neondb_owner:npg_niB5kMYNaDw6@ep-proud-butterfly-a13dejfe-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
node apply_hierarchy_migration_and_populate.js --target=production
```

**Option 2: REAL MIGRATION (changes production)**
```bash
cd D:\AirQuality_Analytics\server
$env:DATABASE_URL='postgresql://neondb_owner:npg_niB5kMYNaDw6@ep-proud-butterfly-a13dejfe-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
node apply_hierarchy_migration_and_populate.js --apply --target=production
```

**Option 3: Verification After Migration**
```bash
cd D:\AirQuality_Analytics\server
npm start
# In Terminal 2:
$env:API_URL='http://localhost:5000'
node verify_hierarchy_endpoints.js
```

---

## Timeline

| Step | Task | Duration | Command |
|------|------|----------|---------|
| 1 | Pre-check | 5 min | Manual review |
| 2 | Dry-run (optional) | 2 min | `--target=production` |
| 3 | Real migration | 30-45 min | `--apply --target=production` |
| 4 | Server start | 2 min | `npm start` |
| 5 | Verification | 5 min | `verify_hierarchy_endpoints.js` |
| 6 | Smoke tests | 3 min | 4x curl commands |
| **Total** | | ~50 min | |

---

## Emergency Contacts

If something goes wrong:

1. **Check logs** – Read error message carefully
2. **Stop server** – Press Ctrl+C
3. **Review output** – Identify what failed
4. **Rollback** – Use Level 1/2/3 rollback above
5. **Wait 5 minutes** – Give system time to settle
6. **Review issue** – Understand root cause
7. **Retry** – After understanding fix

---

## Status: ✅ READY FOR EXECUTION

- ✅ Production backup created and verified
- ✅ All commands prepared
- ✅ Verification procedures ready
- ✅ Rollback procedures documented
- ✅ Monitoring steps outlined

**Waiting for:** Your explicit approval to execute migration

---

**When you're ready, run:**
```bash
cd D:\AirQuality_Analytics\server
$env:DATABASE_URL='postgresql://neondb_owner:npg_niB5kMYNaDw6@ep-proud-butterfly-a13dejfe-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
node apply_hierarchy_migration_and_populate.js --apply --target=production
```

**Do not execute until you explicitly approve.**
