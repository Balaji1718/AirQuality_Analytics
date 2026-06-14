# Staging Cleanup - Operational Execution Checklist

**Purpose:** Step-by-step operational guide for executing the staging cleanup pipeline  
**Audience:** DevOps/Operations Engineers  
**Duration:** ~30-45 minutes (staged-only phase)  
**Risk Level:** 🟢 LOW (staging-only, production protected)  

---

## Pre-Execution Checklist

- [ ] Production database backup taken
- [ ] Staging database backup taken
- [ ] Team notified of staging maintenance window
- [ ] Feature flags documented (should remain enabled)
- [ ] Manual search fallback confirmed working
- [ ] Monitoring dashboard prepared
- [ ] Rollback procedure reviewed

---

## Phase 1: Sanitization & Reporting (Read-Only)

**Time:** ~5 minutes  
**Risk:** 🟢 No database access  

### Step 1.1: Navigate to Project

```bash
cd d:\AirQuality_Analytics\server
```

- [ ] Confirmed in correct directory

### Step 1.2: Run Sanitization

```bash
node sanitize_hierarchy_for_staging.js
```

**Expected Output:**

```
🧹 Sanitizing hierarchy for staging...

✅ Sanitization complete!

📊 Statistics:
  Input:  37 countries, 40 states, 14920 cities
  Output: 37 countries, 10 states, 12490 cities

🗑️  Removed:
  unknown_region: 30
  station_label_only: 2430
  cross_country_duplicate: 496

✨ Quality Validation:
  Passes: ✅
  Unknown regions: 0
  Station-label cities: 0
```

- [ ] Script completed successfully
- [ ] Unknown regions reduced by 30
- [ ] Station labels reduced by 2430
- [ ] Output artifact generated

**Note the artifact filename:** `aqi_coverage_map_sanitized_YYYY-MM-DD.json`

### Step 1.3: Generate Quality Report

```bash
node generate_hierarchy_quality_report.js \
  --sanitized=aqi_coverage_map_sanitized_2024-01-15.json
```

(Replace `2024-01-15` with actual date from previous step)

**Expected Output:**

```
✅ Report generated: server/HIERARCHY_QUALITY_REPORT_2024-01-15.md

Production: 37 countries, 40 states, 14920 cities
  Issues: 30 unknown_regions, 2430 station-labels, 496 cross-country dups

Staging (Sanitized): 37 countries, 10 states, 12490 cities
  Issues: 0 unknown_regions, 0 station-labels, 0 cross-country dups
```

- [ ] Report generated successfully
- [ ] Improvements documented clearly
- [ ] Unknown regions: 100% eliminated
- [ ] Station labels: significantly reduced
- [ ] Cross-country duplicates: significantly reduced

### Step 1.4: Review Quality Report

```bash
cat HIERARCHY_QUALITY_REPORT_2024-01-15.md
```

- [ ] Executive summary reviewed
- [ ] Before/after metrics match expectations
- [ ] Quality validation shows "Passes: ✅"
- [ ] No unexpected data loss

---

## Phase 2: Staging Database Rebuild

**Time:** ~10-15 minutes  
**Risk:** 🟡 Staging-only (requires database access)  

### Step 2.1: Verify Staging Database

```bash
# Check connection
psql "$DATABASE_URL_STAGING" -c "SELECT 1;"
```

Expected: `1` returned

- [ ] Staging database is reachable

### Step 2.2: Create Backup

```bash
# Backup current staging tables (optional but recommended)
pg_dump "$DATABASE_URL_STAGING" \
  --table=aqi_countries \
  --table=aqi_states \
  --table=aqi_cities \
  > staging_hierarchy_backup_$(date +%Y%m%d_%H%M%S).sql
```

- [ ] Backup created

### Step 2.3: Dry-Run Rebuild

```bash
node rebuild_staging_hierarchy_from_sanitized.js \
  --target=staging \
  --artifact=aqi_coverage_map_sanitized_2024-01-15.json
```

(No `--apply` flag = dry-run only)

**Expected Output:**

```
Dry run only. No changes made.
Use --apply --target=staging --artifact=path/to/sanitized.json to execute.
```

- [ ] Dry-run confirmed (no actual changes)

### Step 2.4: Execute Rebuild

```bash
node rebuild_staging_hierarchy_from_sanitized.js \
  --apply \
  --target=staging \
  --artifact=aqi_coverage_map_sanitized_2024-01-15.json
```

**Expected Output:**

```
▶️ Staging-Only Hierarchy Rebuild from Sanitized Artifact

Truncating existing hierarchy tables (staging only)...
✅ Tables truncated

Populating hierarchy from sanitized artifact...
✅ Population complete

Regenerating hierarchy cache...
✅ Cache regenerated

🎉 Staging hierarchy rebuild complete from sanitized artifact.
```

- [ ] Rebuild completed successfully
- [ ] No rollback occurred
- [ ] All operations completed

### Step 2.5: Verify Staging Data

```bash
# In psql or database client
SELECT COUNT(*) as countries FROM aqi_countries;
SELECT COUNT(*) as states FROM aqi_states;
SELECT COUNT(*) as cities FROM aqi_cities;
```

**Expected:**

```
countries |  37
states    |  10  (was 40)
cities    | 12490 (was 14920)
```

- [ ] Country count: 37
- [ ] State count: 10 (reduced from 40)
- [ ] City count: ~12,490 (reduced from 14,920)

### Step 2.6: Verify No Unknown Regions

```bash
SELECT COUNT(*) FROM aqi_states WHERE state_name LIKE 'unknown_%';
```

**Expected:** `0`

- [ ] Unknown regions: 0 (was 30)

---

## Phase 3: Start Staging API Server

**Time:** ~2-3 minutes  
**Risk:** 🟢 Normal operation  

### Step 3.1: In Separate Terminal - Start Server

```bash
# Terminal window 2
cd d:\AirQuality_Analytics
npm start  # or node server/index.js
```

**Expected Output:**

```
Server listening on port 8000
Connected to database
Cache initialized
```

- [ ] Server started successfully
- [ ] Port 8000 is listening
- [ ] Database connection established

### Step 3.2: Verify API is Responding

```bash
# Terminal window 1 (new)
curl http://localhost:8000/countries -s | head -50
```

**Expected:** JSON array with countries

- [ ] API returning data
- [ ] Status 200 received
- [ ] Response time < 500ms

---

## Phase 4: Run Validation Tests

**Time:** ~10-15 minutes  
**Risk:** 🟢 Read-only tests  

### Step 4.1: Run Full Test Suite

```bash
# Terminal window 1
node validate_staging_hierarchy.js --api-url=http://localhost:8000
```

**Expected Output:**

```
📋 Staging Hierarchy Validation Suite

Total tests: 19
✅ Passed: 19
❌ Failed: 0
Status: ✅ ALL TESTS PASSED
```

- [ ] All 19 tests passed
- [ ] No failures
- [ ] Status shows GREEN

### Step 4.2: Test Specific Endpoint

```bash
# Verify no unknown_region countries
curl http://localhost:8000/countries -s | grep -i "unknown"
```

**Expected:** No matches (empty result)

- [ ] No unknown_region countries

### Step 4.3: Test Cities Endpoint

```bash
# Get first country ID
COUNTRY_ID=$(curl http://localhost:8000/countries -s | jq '.[0].id')

# Test cities endpoint
curl http://localhost:8000/countries/$COUNTRY_ID/states -s | head -30
```

- [ ] States endpoint working
- [ ] Response contains cities data
- [ ] No station-only labels (DPCC, CPCB, NMA)

---

## Phase 5: Frontend Smoke Tests

**Time:** ~5-10 minutes  
**Risk:** 🟢 Manual testing  

### Step 5.1: Start Development Server

```bash
# Terminal window 3
cd d:\AirQuality_Analytics\client
npm start
```

**Expected:** Browser opens to http://localhost:3000

- [ ] Development server started
- [ ] Browser loads application

### Step 5.2: Test Hierarchy Dropdowns

1. Open http://localhost:3000
2. Click Country dropdown
   - [ ] Dropdown opens with countries
   - [ ] No "unknown_region" entries visible
   - [ ] ~37 entries shown

3. Select country (e.g., "India")
   - [ ] State dropdown populates
   - [ ] No "unknown_" states visible
   - [ ] Reasonable number of states (5-10 for most countries)

4. Select state (e.g., "Delhi")
   - [ ] City dropdown populates
   - [ ] No raw station labels (e.g., "R K Puram, Delhi - DPCC")
   - [ ] City names appear normalized

5. Select city (e.g., "Delhi")
   - [ ] Search executes
   - [ ] AQI data loads (or search fallback works)
   - [ ] No JavaScript errors in console

### Step 5.3: Test Manual Search Fallback

1. Open Manual Search box (should always be visible)
   - [ ] Search box present and functional
   - [ ] Can type locations

2. Search for "New Delhi"
   - [ ] Results appear
   - [ ] AQI data loads

- [ ] Manual search works independently of hierarchy

### Step 5.4: Check Browser Console

Press `F12` to open Developer Tools → Console tab

- [ ] No RED errors
- [ ] No YELLOW warnings (except expected third-party)
- [ ] Network requests returning 200 status

---

## Phase 6: Final Verification

**Time:** ~5 minutes  
**Risk:** 🟢 Verification only  

### Step 6.1: Verify Production Unchanged

```bash
# Check file modification date
ls -la server/aqi_coverage_map.json
```

**Expected:** Old modification date (unchanged)

- [ ] Production artifact not modified

### Step 6.2: Verify Feature Flags

```bash
grep REACT_APP_ENABLE_HIERARCHY client/.env
```

**Expected:**

```
REACT_APP_ENABLE_HIERARCHY_COUNTRY=true
REACT_APP_ENABLE_HIERARCHY_STATE=true
REACT_APP_ENABLE_HIERARCHY_CITY=true
```

- [ ] Feature flags remain enabled
- [ ] Manual search fallback available

### Step 6.3: Summary Report

Review what was accomplished:

- [ ] Staging sanitized from production artifact
- [ ] Quality report generated (improvements documented)
- [ ] Staging database rebuilt from sanitized artifact
- [ ] All 19 endpoint tests passing
- [ ] Frontend dropdowns working correctly
- [ ] Manual search fallback intact
- [ ] Production database unchanged
- [ ] No unknown_region entries in staging

---

## Rollback Procedures (If Needed)

### Rollback Option A: Database Restore

```bash
# If you have a backup from Step 2.2
psql "$DATABASE_URL_STAGING" < staging_hierarchy_backup_*.sql
```

- [ ] Database restored from backup
- [ ] Rebuild can be re-attempted

### Rollback Option B: Rebuild with Original Artifact

```bash
node rebuild_staging_hierarchy_from_sanitized.js \
  --apply \
  --target=staging \
  --artifact=aqi_coverage_map.json
```

- [ ] Staging restored to production data
- [ ] Original artifact re-used

### Rollback Option C: Disable Feature Flags

```bash
# In .env
REACT_APP_ENABLE_HIERARCHY_COUNTRY=false
REACT_APP_ENABLE_HIERARCHY_STATE=false
REACT_APP_ENABLE_HIERARCHY_CITY=false
```

Restart client: `npm start`

- [ ] Hierarchy dropdowns hidden
- [ ] Manual search remains available
- [ ] User experience preserved

---

## Troubleshooting Quick Reference

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Input file not found" | Missing artifact | Run `node sanitize_hierarchy_for_staging.js` first |
| "Database connection failed" | Wrong DATABASE_URL | Check `.env` staging credentials |
| Tests fail: "API not reachable" | Server not running | Run `npm start` in server directory |
| Unknown regions still visible | Rebuild not executed | Verify `--apply --target=staging` used |
| Staging tests pass but UI empty | Cache not regenerated | Restart server with `npm start` |
| Frontend dropdowns still loading | Browser cache | Hard refresh: `Ctrl+Shift+R` |

---

## Sign-Off

### Completion Checklist

- [ ] Phase 1: Sanitization completed ✓
- [ ] Phase 2: Staging rebuild completed ✓
- [ ] Phase 3: API server running ✓
- [ ] Phase 4: Validation tests passed (19/19) ✓
- [ ] Phase 5: Frontend smoke tests passed ✓
- [ ] Phase 6: Final verification complete ✓
- [ ] All rollback procedures documented ✓
- [ ] No issues requiring escalation

### Sign-Off

**Operator:** ___________________  
**Date/Time:** ___________________  
**Status:** ✅ STAGING VALIDATION COMPLETE  

---

## Next Steps

Once all phases complete successfully:

1. **Documentation**
   - Commit quality report and validation logs

2. **Planning**
   - Schedule production rollout (if approved)
   - Review recommendations from quality report

3. **Monitoring**
   - Monitor staging API performance for 24h
   - Track cache hit rates
   - Monitor error rates (expect 0)

4. **Production Approval**
   - Get stakeholder approval
   - Plan production deployment window
   - Brief on-call team
   - Document production rollback procedure

---

**Checkpoint:** All items in this checklist completed → ✅ STAGING READY FOR PRODUCTION ROLLOUT
