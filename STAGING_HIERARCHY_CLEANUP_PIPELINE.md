## Staging Hierarchy Cleanup & Validation Pipeline

**Document:** Comprehensive guide to the staging-only hierarchy data quality remediation workflow  
**Status:** Staging-only implementation  
**Production:** PROTECTED (unchanged throughout this process)  
**Date:** 2024  

---

## Table of Contents

1. [Overview & Architecture](#overview--architecture)
2. [Pipeline Scripts](#pipeline-scripts)
3. [Execution Workflow](#execution-workflow)
4. [Quality Gates & Validation](#quality-gates--validation)
5. [Monitoring & Rollback](#monitoring--rollback)
6. [Production Application Plan](#production-application-plan)
7. [Troubleshooting](#troubleshooting)

---

## Overview & Architecture

### Problem Statement

The production hierarchy data contains quality issues introduced during the discovery and population pipeline:

- **30 unknown_region placeholder states** (one per country average)
- **2,430 station-label city names** (raw monitoring station identifiers exposed)
- **496 cross-country city duplicates** (e.g., Amsterdam appearing in 15+ countries)
- **Weak country validation** at source API ingestion

### Solution Architecture

This pipeline implements a **staging-only** 4-phase cleanup:

```
Phase 1: Sanitization
├─ Read production artifact (aqi_coverage_map.json)
├─ Apply normalization rules (filter, deduplicate, validate)
└─ Generate sanitized artifact (aqi_coverage_map_sanitized_*.json)

Phase 2: Quality Reporting
├─ Validate both production and sanitized data
├─ Generate before/after metrics
└─ Produce markdown quality report

Phase 3: Staging Rebuild
├─ Truncate staging hierarchy tables
├─ Populate from sanitized artifact
└─ Regenerate hierarchy cache

Phase 4: Validation & Testing
├─ Run endpoint tests (29-test suite)
├─ Validate data quality gates
├─ Frontend smoke tests
└─ Manual search fallback verification
```

### Safety Guarantees

✅ **Production Protected**
- Source artifact (aqi_coverage_map.json) remains unchanged
- Production database untouched
- Feature flags remain active
- Manual AQI search fallback intact

✅ **Staging Isolated**
- All rebuilds target staging environment only
- Requires explicit `--target=staging` confirmation
- Dry-run mode by default (no changes without `--apply`)
- Transaction-wrapped for atomic rollback

✅ **Auditability**
- All normalization rules documented
- Before/after metrics transparent
- Quality gates logged
- Rollback-safe controls at each step

---

## Pipeline Scripts

### 1. `sanitize_hierarchy_for_staging.js`

**Purpose:** Read production artifact and generate sanitized copy  
**Input:** `aqi_coverage_map.json`  
**Output:** `aqi_coverage_map_sanitized_YYYY-MM-DD.json`  
**Safeguards:** Read-only, no database access  

#### Normalization Rules Applied

1. **Strict Country Validation**
   - Rejects malformed country keys (numeric, empty, invalid format)
   - Validates against ISO2/ISO3 codes

2. **Unknown Region Filtering**
   - Removes all `unknown_*` placeholder states
   - Eliminates fallback region entries

3. **Station Label Sanitization**
   - Detects raw monitoring station patterns
   - Filters pure operator/agency labels (DPCC, CPCB, NMA, etc.)
   - Normalizes labels to display-friendly names

4. **Coordinate Validation**
   - Rejects entries with missing lat/lon
   - Validates lat ∈ [-90, 90], lon ∈ [-180, 180]

5. **Cross-Country Leakage Detection**
   - Identifies cities appearing in multiple countries
   - Flags implausible duplicates for review
   - Deduplicates within geographic context

6. **Canonical Deduplication**
   - Generates MD5-based canonical keys per city
   - Location-aware: (name, country, lat, lon) → hash
   - Suppresses within-state duplicates

#### Execution

```bash
cd server
node sanitize_hierarchy_for_staging.js
```

#### Output Example

```
🧹 Sanitizing hierarchy for staging...

✅ Sanitization complete!

📊 Statistics:
  Input:  37 countries, 40 states, 14920 cities
  Output: 37 countries, 10 states, 12490 cities

🗑️  Removed:
  malformed_country_key: 0
  unknown_region: 30
  invalid_state: 0
  invalid_city_record: 215
  station_label_only: 2430
  cross_country_duplicate: 496
  invalid_coordinates: 259

✨ Quality Validation:
  Passes: ✅
  Unknown regions: 0
  Station-label cities: 0
  Cross-country leaks detected: 0

📁 Sanitized artifact: server/aqi_coverage_map_sanitized_2024-01-15.json
```

---

### 2. `generate_hierarchy_quality_report.js`

**Purpose:** Compare production vs. sanitized data and generate metrics  
**Inputs:**
- `aqi_coverage_map.json` (production)
- `aqi_coverage_map_sanitized_*.json` (staging)

**Output:** `HIERARCHY_QUALITY_REPORT_*.md`  
**Safeguards:** Read-only, no database access  

#### Report Sections

1. **Executive Summary**
   - Key findings (issues eliminated, reductions)
   - Quality status before/after

2. **Detailed Metrics**
   - Country/state/city counts
   - Unknown region counts
   - Station label counts
   - Duplicate city name counts

3. **Improvements**
   - Quantitative changes (absolute and %)
   - 100% elimination targets (unknown_regions)
   - Reduction targets (station labels, duplicates)

4. **Quality Validation**
   - Production validation report
   - Staging validation report
   - Issues resolved

5. **Top Cross-Country Duplicates**
   - Cities appearing in multiple countries
   - Count of affected entries

6. **Recommendations**
   - Immediate staging actions
   - Pre-production verification checklist

#### Execution

```bash
cd server
node generate_hierarchy_quality_report.js \
  --sanitized=aqi_coverage_map_sanitized_2024-01-15.json
```

#### Output Example

```
📊 Generating quality report...

✅ Report generated: server/HIERARCHY_QUALITY_REPORT_2024-01-15.md

Production: 37 countries, 40 states, 14920 cities
  Issues: 30 unknown_regions, 2430 station-labels, 496 cross-country dups

Staging (Sanitized): 37 countries, 10 states, 12490 cities
  Issues: 0 unknown_regions, 0 station-labels, 0 cross-country dups

Improvements:
  ✅ Unknown regions: -30
  ✅ Station labels: -2430
  ✅ Cross-country dups: -496
```

---

### 3. `rebuild_staging_hierarchy_from_sanitized.js`

**Purpose:** Rebuild staging hierarchy tables from sanitized artifact  
**Safeguards:**
- Requires `--apply` flag
- Requires `--target=staging` confirmation
- Requires explicit `--artifact=path` parameter
- Dry-run by default
- Transaction-wrapped for atomic rollback
- Production-protected (staging environment only)

**Execution**

```bash
cd server

# Dry-run (view what would happen)
node rebuild_staging_hierarchy_from_sanitized.js \
  --target=staging \
  --artifact=aqi_coverage_map_sanitized_2024-01-15.json

# Execute rebuild
node rebuild_staging_hierarchy_from_sanitized.js \
  --apply \
  --target=staging \
  --artifact=aqi_coverage_map_sanitized_2024-01-15.json
```

**What It Does**

1. Validates connection to database
2. Begins transaction
3. Truncates: `aqi_hierarchy_cache`, `aqi_cities`, `aqi_states`, `aqi_countries`
4. Populates all 4 tables from sanitized artifact
5. Regenerates hierarchy cache JSON
6. Commits transaction (atomic)
7. On error: automatic rollback

**Output Example**

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

---

### 4. `staging_hierarchy_orchestrator.js`

**Purpose:** Coordinate entire pipeline in correct order  
**Mode:** Read-only report (default) or with `--rebuild` flag  

**Execution**

```bash
cd server

# Generate report only (dry-run)
node staging_hierarchy_orchestrator.js

# Generate report + rebuild staging
node staging_hierarchy_orchestrator.js --rebuild
```

**Workflow**

```
Step 1: Validate Environment
  └─ Check production artifact exists

Step 2: Generate Sanitized Artifact
  └─ Run sanitize_hierarchy_for_staging.js

Step 3: Generate Quality Report
  └─ Run generate_hierarchy_quality_report.js

Step 4: Rebuild Staging (if --rebuild)
  └─ Run rebuild_staging_hierarchy_from_sanitized.js --apply --target=staging
```

---

### 5. `validate_staging_hierarchy.js`

**Purpose:** Run comprehensive tests against staging after rebuild  
**Dependencies:** Requires staging API server running  
**Safeguards:** Read-only, no data modification  

**Execution**

```bash
cd server

# Default: http://localhost:8000
node validate_staging_hierarchy.js

# Custom staging API URL
node validate_staging_hierarchy.js --api-url=https://staging.example.com
```

**Test Categories**

1. **Connectivity (1 test)**
   - API is reachable
   - Returns 200 status

2. **Countries Endpoint (3 tests)**
   - Returns array of countries
   - Fields: id, name, state_count
   - No unknown_region countries

3. **States Endpoint (3 tests)**
   - Returns array for specific country
   - Fields: id, name, city_count
   - No unknown_region states

4. **Cities Endpoint (3 tests)**
   - Returns paginated cities for state
   - Fields: id, name, coordinates
   - No pure station/agency label cities

5. **Search Endpoint (2 tests)**
   - Search for "Delhi" returns results
   - Results have required fields

6. **Validate Endpoint (2 tests)**
   - Accept valid locations
   - Reject invalid locations

7. **Pagination (1 test)**
   - Supports page/limit parameters
   - Returns total count

8. **Data Quality (1 test)**
   - All coordinates are valid
   - Lat ∈ [-90, 90], Lon ∈ [-180, 180]

**Output Example**

```
📋 Staging Hierarchy Validation Suite

Target API: http://localhost:8000

🔌 Connectivity Tests:
  ✅ API is reachable

🌍 Countries Endpoint Tests:
  ✅ GET /countries returns array
  ✅ Countries have required fields
  ✅ No unknown_region countries

... [more tests] ...

═══════════════════════════════════════════════════════════════════════════
  VALIDATION SUMMARY
═══════════════════════════════════════════════════════════════════════════

Total tests: 19
✅ Passed: 19
❌ Failed: 0
Status: ✅ ALL TESTS PASSED
```

---

## Execution Workflow

### Quick Start (Orchestrated)

```bash
cd server

# Step 1: Generate report and validate (dry-run)
node staging_hierarchy_orchestrator.js

# Review HIERARCHY_QUALITY_REPORT_*.md

# Step 2: Rebuild staging with orchestrator
node staging_hierarchy_orchestrator.js --rebuild

# Step 3: Run staging API validation
npm start  # Start server in another terminal
node validate_staging_hierarchy.js

# Step 4: Manual smoke tests
# - Test frontend dropdowns in browser
# - Verify manual search still works
```

### Manual Detailed Workflow

```bash
cd server

# Phase 1: Sanitize
node sanitize_hierarchy_for_staging.js
# Output: aqi_coverage_map_sanitized_2024-01-15.json

# Phase 2: Generate Report
node generate_hierarchy_quality_report.js \
  --sanitized=aqi_coverage_map_sanitized_2024-01-15.json
# Output: HIERARCHY_QUALITY_REPORT_2024-01-15.md

# Phase 3: Rebuild Staging (requires staging environment)
node rebuild_staging_hierarchy_from_sanitized.js \
  --apply \
  --target=staging \
  --artifact=aqi_coverage_map_sanitized_2024-01-15.json

# Phase 4: Validate Staging
npm start  # Start server
# In another terminal:
node validate_staging_hierarchy.js --api-url=http://localhost:8000

# Phase 5: Frontend Testing (manual)
# - Open browser to http://localhost:3000
# - Test hierarchy dropdowns (country → state → city)
# - Test manual search still works
# - Verify no "unknown_region" in dropdowns
# - Verify no raw station labels displayed
```

---

## Quality Gates & Validation

### Before Staging Rebuild

✅ **Sanitization Quality Gate**
```
node sanitize_hierarchy_for_staging.js
# Validates:
✅ Passes: Yes (in output)
✅ Unknown regions: 0
✅ Station-label cities: 0
✅ Cross-country leaks detected: 0
```

✅ **Report Comparison**
```
Review HIERARCHY_QUALITY_REPORT_*.md
- Production issues clearly documented
- Staging improvements quantified
- Recommendations provided
```

### After Staging Rebuild

✅ **Data Integrity**
```
SELECT COUNT(*) FROM aqi_countries;           -- Should be 37
SELECT COUNT(*) FROM aqi_states;              -- Should be 10 (was 40)
SELECT COUNT(*) FROM aqi_cities;              -- Should be ~12,490 (was 14,920)
```

✅ **No Unknown Regions**
```sql
SELECT COUNT(*) FROM aqi_states 
WHERE state_name LIKE 'unknown_%';            -- Should be 0 (was 30)
```

✅ **No Pure Station Labels**
```sql
SELECT COUNT(*) FROM aqi_cities 
WHERE city_name IN ('DPCC', 'CPCB', 'WAQI'); -- Should be 0 (was many)
```

✅ **Endpoint Test Suite**
```bash
node validate_staging_hierarchy.js
# All 19 tests must pass
✅ Passed: 19
❌ Failed: 0
```

✅ **Frontend Smoke Tests**
- Country dropdown loads
- State dropdown loads and populates on country select
- City dropdown loads and populates on state select
- No "unknown_region" visible
- No raw station labels visible
- Manual search still works as fallback

---

## Monitoring & Rollback

### Health Checks During Staging

```bash
# Check database connection
curl http://localhost:8000/countries

# Check for errors in logs
tail -f server.log | grep ERROR

# Monitor response times
curl -w "%{time_total}\n" http://localhost:8000/countries
```

### Rollback Procedures

#### If Staging Rebuild Fails

**Automatic:** Transaction rollback (all-or-nothing)

```bash
# The rebuild script wraps all operations in a transaction:
BEGIN;
  DELETE FROM aqi_hierarchy_cache;
  DELETE FROM aqi_cities;
  ... 
  (If any step fails, automatic ROLLBACK;)
```

#### If Validation Tests Fail

**Manual:** Restore from backup or re-execute with original artifact

```bash
# Re-run with production artifact
node rebuild_staging_hierarchy_from_sanitized.js \
  --apply \
  --target=staging \
  --artifact=aqi_coverage_map.json

# Restore from database backup if available
```

#### If Frontend Issues Appear

**Immediate:** Disable feature flags (preserve manual search)

```bash
# .env
REACT_APP_ENABLE_HIERARCHY_COUNTRY=false
REACT_APP_ENABLE_HIERARCHY_STATE=false
REACT_APP_ENABLE_HIERARCHY_CITY=false
```

Manual search fallback remains fully functional.

---

## Production Application Plan

### Pre-Production Checklist

- [ ] Staging validation: all 19 tests pass
- [ ] Quality report shows expected improvements
- [ ] Frontend smoke tests successful
- [ ] Manual search unchanged
- [ ] Existing AQI endpoints stable
- [ ] Monitoring dashboard prepared
- [ ] Rollback procedure documented
- [ ] Team approval obtained

### Production Migration Steps

**Once staging validation complete:**

1. **Generate Production Sanitized Artifact**
   ```bash
   node sanitize_hierarchy_for_staging.js
   # (same script, same rules apply to production data)
   ```

2. **Execute Production Rebuild** (similar script, `--target=production`)
   - Requires senior engineer approval
   - Transaction-wrapped (atomic)
   - Monitoring active
   - Rollback procedure on standby

3. **Post-Deploy Verification**
   - Run production endpoint tests
   - Monitor error rates (expect ↓)
   - Monitor response times (expect ≈ same)
   - Monitor data accuracy (expect ↑)
   - Verify no user complaints

4. **Monitoring Window**
   - 0-2h: Every 15 minutes
   - 2-8h: Every 30 minutes
   - 8-24h: Every 2 hours
   - See: `PRODUCTION_POST_DEPLOY_MONITORING_CHECKLIST.md`

### Feature Flag Management

```
During staging:
✅ REACT_APP_ENABLE_HIERARCHY_* = true (enabled)
✅ Manual search = available

Production rollout:
✅ REACT_APP_ENABLE_HIERARCHY_* = true (enabled)
✅ Manual search = available

Rollback (if needed):
✅ REACT_APP_ENABLE_HIERARCHY_* = false (disabled)
✅ Manual search = available (fallback)
```

---

## Troubleshooting

### Sanitization Issues

**Error: "Input file not found"**
```bash
# Solution: Ensure aqi_coverage_map.json exists in server/
ls -la server/aqi_coverage_map.json

# If missing: Run discovery pipeline first
node discover_aqi_coverage.js
```

**Error: "Sanitized artifact not generated"**
```bash
# Solution: Check normalization_rules.js exports
node -e "const m = require('./hierarchy_normalization_rules'); console.log(Object.keys(m));"
# Should show: normalizeCityLabel, generateCanonicalCityKey, ...
```

### Rebuild Issues

**Error: "Database connection failed"**
```bash
# Solution: Verify database credentials in .env
grep DATABASE_URL .env

# Test connection
node -e "const db = require('./db'); db.testConnection().then(ok => console.log(ok ? 'OK' : 'FAIL'));"
```

**Error: "This script only runs against staging"**
```bash
# Solution: Always use --target=staging
node rebuild_staging_hierarchy_from_sanitized.js \
  --apply \
  --target=staging \      # <-- REQUIRED
  --artifact=aqi_coverage_map_sanitized_2024-01-15.json
```

**Error: "Artifact file not found"**
```bash
# Solution: Verify artifact path
ls -la server/aqi_coverage_map_sanitized_*.json

# Use full path if needed
node rebuild_staging_hierarchy_from_sanitized.js \
  --apply \
  --target=staging \
  --artifact=/full/path/to/aqi_coverage_map_sanitized_2024-01-15.json
```

### Validation Issues

**Error: "API is not reachable"**
```bash
# Solution: Start the server first
npm start  # In server terminal

# Wait for "listening on port 8000"
# Then run validation in another terminal
node validate_staging_hierarchy.js
```

**Error: "Some tests failed"**
```bash
# Solution: Review specific failures in output
node validate_staging_hierarchy.js 2>&1 | grep "❌"

# Check server logs for errors
tail -f server.log | grep ERROR
```

### Common Issues & Fixes

| Issue | Cause | Solution |
|-------|-------|----------|
| unknown_region still visible | Rebuild not executed | Run `--apply --target=staging` |
| Station labels still present | Rules not applied correctly | Review hierarchy_normalization_rules.js |
| City count unchanged | Sanitizer not running | Check console output for errors |
| Frontend dropdowns empty | API returning empty data | Run validate_staging_hierarchy.js |
| Response times slow | Cache not regenerated | Check aqi_hierarchy_cache table |

---

## Appendices

### File Manifest

| File | Purpose | Read-only | Type |
|------|---------|-----------|------|
| sanitize_hierarchy_for_staging.js | Generate sanitized artifact | ✅ | Utility |
| generate_hierarchy_quality_report.js | Compare before/after | ✅ | Reporting |
| rebuild_staging_hierarchy_from_sanitized.js | Rebuild staging tables | ❌ | Migration |
| staging_hierarchy_orchestrator.js | Coordinate pipeline | ✅ | Orchestrator |
| validate_staging_hierarchy.js | Test endpoints | ✅ | Testing |
| hierarchy_normalization_rules.js | Validation functions | ✅ | Library |
| STAGING_HIERARCHY_CLEANUP_PIPELINE.md | This document | ✅ | Documentation |

### Environment Variables Required

```bash
# Database connection (staging)
DATABASE_URL=postgresql://user:pass@host:5432/db_staging?sslmode=require

# API Server port
PORT=8000

# Feature flags (keep active during staging)
REACT_APP_ENABLE_HIERARCHY_COUNTRY=true
REACT_APP_ENABLE_HIERARCHY_STATE=true
REACT_APP_ENABLE_HIERARCHY_CITY=true
```

### References

- [Root Cause Analysis](HIERARCHY_DATA_QUALITY_ROOT_CAUSE_AND_CLEANUP_PLAN.md)
- [Normalization Rules](server/hierarchy_normalization_rules.js)
- [Post-Deploy Monitoring](PRODUCTION_POST_DEPLOY_MONITORING_CHECKLIST.md)
- [API Documentation](server/hierarchy.js)

---

**Status:** ✅ Ready for staging execution  
**Approval:** [Pending]  
**Last Updated:** 2024  
