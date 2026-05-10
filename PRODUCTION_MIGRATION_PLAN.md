# Production Migration Plan: Hierarchy API & Data Cleanup
**Version:** 1.0  
**Date Prepared:** 2026-05-10  
**Status:** Ready for Review (Pre-Execution)  
**Environment:** Production Neon PostgreSQL  

---

## 1. Overview

This plan outlines the controlled migration of validated hierarchy data and validation safeguards from staging to production. All changes have been verified on staging and are guarded to prevent accidental execution.

**Key Objectives:**
- ✅ Deploy validated hierarchy schema and API endpoints
- ✅ Apply production cleanup to remove malformed entries (if present)
- ✅ Enforce validation/sanitization across population pipeline
- ✅ Regenerate hierarchy cache with clean data
- ✅ Verify all APIs functional before frontend activation
- ✅ Maintain zero-downtime deployment window
- ✅ Enable rapid rollback if issues detected

---

## 2. Production Database Baseline

**Current Production Environment:**
- **Database:** PostgreSQL (Neon)
- **Host:** ep-proud-butterfly-a13dejfe-pooler.ap-southeast-1.aws.neon.tech
- **Database:** neondb
- **User:** neondb_owner
- **Connection:** Pooled, SSL + channel binding required

**Current Production Tables (Pre-Migration):**
- `aqi_measurements` – Core AQI data collection
- `aqi_locations` – Manual location search fallback
- `aqi_coverage` – Coverage metadata (existing)
- *(New tables will be added by migration: aqi_countries, aqi_states, aqi_cities, aqi_hierarchy_cache)*

**Known State:**
- Production API running normally (manual text search active)
- No hierarchy tables present yet
- Manual fallback in place via `/api/locations`

---

## 3. Validation & Safeguards Included in Production Rollout

All validation logic from staging will be deployed unchanged:

### 3.1 Input Validation (populateHierarchy)
```javascript
// Country name validation
- Minimum 2 characters, maximum 100
- Must contain at least one alphabetic character (rejects "0", "1", "2")
- Rejects numeric-only keys
- Trims whitespace

// State name validation
- Non-empty after trim
- Skips null/undefined entries

// City validation
- Name required (non-null)
- Coordinates preserved as-is (null-safe)
- Source list normalized (arrays + singletons)

// iso2 sanitization
- Uppercase conversion
- 2-3 letter validation only
- Rejects invalid formats
```

### 3.2 Coverage Map Pre-Flight Check (Migration Runner)
```javascript
// Before population starts:
1. Validate each coverage map key
2. Identify invalid country names
3. Log warnings for skipped entries
4. Remove invalid keys from coverage data
5. Proceed with cleaned map only
```

### 3.3 Cleanup Logic (Guarded Script)
```javascript
// cleanup_malformed_countries.js
- Requires: --apply --target=production
- Identifies: numeric-only country names
- Deletes: malformed countries + cascade deletions
- Logs: counts before/after
- Atomic: wrapped in BEGIN/COMMIT with rollback
- Guard: requires explicit staging/production target flag
```

### 3.4 API Response Filtering (hierarchy.js)
```javascript
// All endpoints validate countries/states before response:
- detectHierarchySource() verifies table presence
- fetchCountries() filters valid records
- fetchStates/Cities() validate IDs and foreign keys
- searchHierarchy() sanitizes query terms
- validateCountryId/StateId() enforce constraints
```

---

## 4. Migration Execution Flow

### Phase 1: Pre-Migration (Before Execution Window)
```
[ ] Review this migration plan
[ ] Verify production backup captured
[ ] Confirm rollback procedure ready
[ ] Test migration commands in rehearsal
[ ] Alert monitoring/on-call team
[ ] Post maintenance window notice
```

### Phase 2: Migration Execution (Zero-Downtime Window ~30 min)
```
1. Backup/snapshot production DB
2. Apply schema migration (aqi_* tables + view)
3. Run cleanup (if malformed data detected in production)
4. Populate hierarchy from aqi_coverage_map.json
5. Generate hierarchy cache entries
6. Start staging verification against production
7. Run 29-test verification suite
8. Validate no errors in production logs
9. Sign off: Ready for frontend activation
```

### Phase 3: Post-Migration (After Verification)
```
[ ] All tests passing (29/29)
[ ] No malformed data detected
[ ] Cache fully populated (37 countries expected)
[ ] API response times normal
[ ] Log monitoring clean
[ ] Kept paused: frontend integration
[ ] Kept paused: manual search still primary
```

---

## 5. Risk Mitigation

### High-Risk Areas
1. **Schema Conflicts** – New tables already exist in prod?
   - Mitigation: Migration uses `IF NOT EXISTS`, idempotent by design
   - Backup before execution

2. **Data Corruption** – Malformed production data?
   - Mitigation: Pre-flight validation checks and cleanup script
   - Cleanup is guarded, requires explicit approval

3. **Performance Impact** – Large population takes too long?
   - Mitigation: Tested on staging (completed in ~1 min)
   - Off-peak execution window

4. **Fallback Disruption** – Manual search breaks?
   - Mitigation: `/api/locations` unaffected, still primary
   - Hierarchy is supplementary

### Medium-Risk Areas
1. Network connectivity loss during migration
   - Mitigation: Atomic transaction (BEGIN/COMMIT/ROLLBACK)
   - Auto-rollback on connection loss

2. Cache generation incomplete
   - Mitigation: Cache is non-critical (DB is source of truth)
   - Manual re-generation available if needed

3. Frontend accidentally uses before ready
   - Mitigation: Frontend integration explicitly paused until production sign-off

---

## 6. Rollback Procedure

### Automatic Rollback (On Failure)
```bash
# If migration fails, transaction auto-rolls back:
await client.query('ROLLBACK');
```

### Manual Rollback (If Issues Post-Deployment)
```sql
-- Remove all new hierarchy tables and view
DROP VIEW IF EXISTS aqi_coverage_summary;
DROP TABLE IF EXISTS aqi_hierarchy_cache;
DROP TABLE IF EXISTS aqi_cities;
DROP TABLE IF EXISTS aqi_states;
DROP TABLE IF EXISTS aqi_countries;

-- Production data remains intact
-- Manual search still fully functional
```

### Restore from Backup (If Critical)
```bash
# Pre-migration backup snapshot available
# Contact: Neon database admin
# Restore command: <provided by Neon support>
# RTO: ~5-10 minutes
```

---

## 7. Backup & Snapshot Readiness

### Pre-Migration Backup Requirements
- [ ] Neon production backup captured (before migration window)
- [ ] Backup verified readable/restorable
- [ ] Backup credentials secured
- [ ] Restore procedure tested (in staging environment)

### Snapshot Information
- **Type:** Neon Point-in-Time (PIT) snapshot
- **Timing:** Captured 5 minutes before migration window start
- **Retention:** 7 days (Neon default)
- **Access:** Via Neon dashboard or support

### Restore Procedure (If Needed)
```
1. Contact Neon support or use dashboard
2. Restore from PIT snapshot (just before migration)
3. Point production connection to restored instance
4. Verify data integrity
5. Restart application
```

---

## 8. Production Migration Commands

### Guard Rails Active
All commands include safeguards:
- `--apply` required (prevents accidental dry-runs)
- `--target=production` required (prevents cross-environment mistakes)
- Explicit DATABASE_URL setting (prevents wrong DB selection)
- Transaction wrapping (auto-rollback on error)
- Validation logging (shows what was filtered/cleaned)

### Command 1: Apply Schema Migration Only (Dry-Run First)
```bash
# DRY RUN (no changes)
cd server
$env:DATABASE_URL='postgresql://neondb_owner:npg_niB5kMYNaDw6@ep-proud-butterfly-a13dejfe-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
node apply_hierarchy_migration_and_populate.js

# Expected output:
# "Dry run only. No database changes were made."
# "Use --apply with --target=local|staging to execute..."
```

### Command 2: Production Migration & Population (Guarded Execution)
```bash
# PRODUCTION EXECUTION (with guards)
cd server
$env:DATABASE_URL='postgresql://neondb_owner:npg_niB5kMYNaDw6@ep-proud-butterfly-a13dejfe-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
node apply_hierarchy_migration_and_populate.js --apply --target=production

# Expected output:
# ▶️ Applying hierarchical migration and populating data...
# 🔄 Testing Neon database connection...
# ✅ Neon Database connected
# ⚠️ Coverage map contains invalid country keys that will be skipped: [any invalid]
# Applying migration SQL...
# ✅ Migration applied
# Populating hierarchy tables from coverage map...
# 📊 Populating hierarchical location schema...
# ✅ Populated [country names]...
# ✅ Hierarchy population complete
# Generating hierarchy cache entries...
# ✅ Hierarchy cache generated
# 🎉 Done. Migration, population, and cache generation finished for production.
```

### Command 3: Cleanup Malformed Countries (If Needed)
```bash
# CLEANUP ONLY (separate command, requires detection first)
cd server
$env:DATABASE_URL='postgresql://neondb_owner:npg_niB5kMYNaDw6@ep-proud-butterfly-a13dejfe-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
node cleanup_malformed_countries.js --apply --target=production

# Expected output:
# ✅ Neon Database connected
# Found malformed countries: [if any]
# Counts before deletion: {country_ids...}
# Deleted countries: [list]
# Cleanup complete.
```

### Command 4: Inspection After Migration
```bash
# VERIFY COUNTS AND DATA QUALITY
cd server
$env:DATABASE_URL='postgresql://neondb_owner:npg_niB5kMYNaDw6@ep-proud-butterfly-a13dejfe-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
node cleanup_inspect.js

# Expected output:
# aqi_countries: 37
# aqi_states: 40
# aqi_cities: 14950
# aqi_hierarchy_cache: 37
# malformed_countries: 0
# sample_countries: [valid country names]
```

---

## 9. Production Verification Workflow

### Step 1: Start Production API Server
```bash
cd server
Set-Item -Path env:PORT -Value 5000
Set-Item -Path env:DATABASE_URL -Value 'postgresql://...<production URL>'
npm start
# Expected: "Server running on http://localhost:5000"
# Expected: "✅ Hierarchy: Loaded 37 countries with coverage data"
# Expected: "✅ Hierarchy API routes mounted at /api/hierarchy/*"
```

### Step 2: Run 29-Test Verification Suite Against Production
```bash
cd server
$env:API_URL='http://localhost:5000'
node verify_hierarchy_endpoints.js

# Expected: 29/29 tests passing
# All 6 test suites green
```

### Step 3: Manual Smoke Tests (Production API)
```bash
# Test 1: Fetch countries
curl http://localhost:5000/api/hierarchy/countries?limit=5

# Test 2: Fetch states for a country
curl http://localhost:5000/api/hierarchy/countries/1/states

# Test 3: Search
curl http://localhost:5000/api/hierarchy/search?q=India

# Test 4: Validate
curl -X POST http://localhost:5000/api/hierarchy/validate

# Expected: All return 200, valid JSON, no malformed entries
```

### Step 4: Verify Existing API Unchanged
```bash
# Test: Manual search (must still work)
curl http://localhost:5000/api/locations?query=Delhi

# Expected: 200 OK, original functionality intact
```

---

## 10. Post-Migration Validation Checklist

- [ ] Neon production DB connected successfully
- [ ] Schema migration applied (4 new tables created)
- [ ] Coverage map pre-flight validation passed
- [ ] Population completed without errors
- [ ] Cache generated (37 countries)
- [ ] Malformed countries found: 0
- [ ] aqi_countries table count: 37
- [ ] aqi_states table count: 40
- [ ] aqi_cities table count: ~14,950
- [ ] aqi_hierarchy_cache table count: 37
- [ ] Sample country names verified (clean data)
- [ ] API server started successfully
- [ ] All 29 verification tests passing
- [ ] GET /api/hierarchy/countries returns valid data
- [ ] GET /api/hierarchy/countries/:id/states returns valid data
- [ ] GET /api/hierarchy/countries/:id/states/:id/cities returns valid data
- [ ] GET /api/hierarchy/search?q=query returns results
- [ ] POST /api/hierarchy/validate returns metadata
- [ ] Manual search API still functional
- [ ] No errors in application logs
- [ ] Response times normal (<100ms for cached endpoints)
- [ ] No data corruption detected
- [ ] Database indexes created and functional

---

## 11. Monitoring Plan (First Deployment Window)

### Real-Time Monitoring (During & After Migration)
- [ ] Database connection health
- [ ] Migration transaction status (successful COMMIT or ROLLBACK)
- [ ] API response times (should be <100ms for hierarchy endpoints)
- [ ] Error logs (should be clean)
- [ ] Cache hit rates (should be high for GET /countries)
- [ ] Test suite results (29/29 expected)

### Metrics to Track
```
Metric                           | Threshold      | Action if Exceeded
─────────────────────────────────────────────────────────────────────
/api/hierarchy/* response time   | >500ms         | Investigate index/query
/api/hierarchy/* error rate      | >0.1%          | Check logs, rollback if >1%
Database connection pool         | >80% usage     | Scale/investigate
Cache hit rate                   | <70%           | Verify cache generation
aqi_hierarchy_cache rows         | 37±2           | Verify population
Malformed country entries        | >0             | Run cleanup + revert
```

### Alert Recipients
- **Critical Issues:** Ops team, on-call engineer
- **Warnings:** Development team, database admin
- **Info:** Project lead, stakeholder

### First-Window Duration
- **24 hours:** Active monitoring (check every 15 min)
- **Day 2-3:** Elevated monitoring (check every hour)
- **Day 4-7:** Standard monitoring (daily check)

### Escalation Procedure
If **any** of the following occurs:
1. Verification tests drop below 29/29
2. Error rate exceeds 1%
3. Malformed data detected post-migration
4. Response time exceeds 1000ms

**Action:**
1. Enable rollback (< 5 min)
2. Notify team
3. Restore from backup (< 10 min)
4. Post-mortem review

---

## 12. Timeline & Approval

### Pre-Migration (This Week)
- [ ] 2026-05-10: Review migration plan (you are here)
- [ ] 2026-05-10: Verify rollback procedure
- [ ] 2026-05-10: Confirm backup/snapshot readiness
- [ ] 2026-05-10: Generate final approval checklist

### Migration Window (Next Week - TBD)
- [ ] User selects execution date (off-peak)
- [ ] Pre-migration tasks completed
- [ ] Execute schema + population
- [ ] Run verification suite
- [ ] 30-min total downtime window

### Post-Migration (After Sign-Off)
- [ ] Monitoring active for 24 hours
- [ ] Frontend hierarchy integration enabled (when approved)
- [ ] Manual search remains primary fallback

---

## 13. Final Approval Checklist (Before Execution)

### Technical Review
- [ ] Schema migration code reviewed
- [ ] Validation logic verified against staging results
- [ ] Cleanup procedure tested and approved
- [ ] Guard rails confirmed active
- [ ] Rollback procedure verified

### Operational Review
- [ ] Backup/snapshot captured and tested
- [ ] Monitoring dashboards ready
- [ ] Alert recipients identified
- [ ] On-call engineer briefed
- [ ] Maintenance window scheduled

### Stakeholder Review
- [ ] Frontend team aware (integration still paused)
- [ ] Product owner approved timeline
- [ ] DevOps/DBA ready for execution
- [ ] Fallback plan (manual search) confirmed active

---

**Document Status:** Ready for Review  
**Next Step:** User approves → Proceed to Pre-Migration Checklist & Final Authorization

---

**Questions or Concerns?**
- Guard rail execution: Review Command 2 and Command 3
- Validation logic: See Section 3 (Validation & Safeguards)
- Rollback timeline: Section 6 (Rollback Procedure)
- Risk mitigation: Section 5 (Risk Mitigation)
