# Staging Hierarchy Cleanup - Quick Start Guide

**Status:** Ready to execute  
**Risk Level:** 🟢 LOW (staging-only)  
**Estimated Time:** 45 minutes  

---

## One-Line Summary

Staging-only cleanup pipeline: sanitizes production artifact → generates quality report → rebuilds staging tables → validates with 19 tests → smoke tests UI

---

## 5-Minute Quick Start

### Step 1: Generate Report & Sanitized Artifact (5 min, read-only)

```bash
cd d:\AirQuality_Analytics\server
node sanitize_hierarchy_for_staging.js
node generate_hierarchy_quality_report.js --sanitized=aqi_coverage_map_sanitized_2024-01-15.json
```

**Result:** Review `HIERARCHY_QUALITY_REPORT_*.md` to see before/after metrics

### Step 2: Rebuild Staging (10 min, staging-only)

```bash
node rebuild_staging_hierarchy_from_sanitized.js \
  --apply \
  --target=staging \
  --artifact=aqi_coverage_map_sanitized_2024-01-15.json
```

**Result:** Staging hierarchy tables updated

### Step 3: Run API Tests (5 min)

Start server in Terminal 2:
```bash
npm start
```

Run tests in Terminal 1:
```bash
node validate_staging_hierarchy.js
```

**Result:** All 19 tests pass ✅

### Step 4: Smoke Test UI (5 min)

Start client in Terminal 3:
```bash
cd d:\AirQuality_Analytics\client
npm start
```

**Verify:**
- Country dropdown loads
- State dropdown populates
- City dropdown populates
- No "unknown_region" or station labels visible

---

## Full Orchestrated Workflow

### Automated (Recommended)

```bash
cd d:\AirQuality_Analytics\server

# Generate report only (dry-run)
node staging_hierarchy_orchestrator.js

# Execute full pipeline including staging rebuild
node staging_hierarchy_orchestrator.js --rebuild
```

This automatically runs:
1. Sanitization
2. Quality report generation
3. Staging database rebuild
4. Summary display

---

## What Each Script Does

| Script | Purpose | Duration | Risk | Command |
|--------|---------|----------|------|---------|
| `sanitize_hierarchy_for_staging.js` | Reads production artifact, applies 6 normalization rules, generates sanitized copy | 2 min | 🟢 | `node sanitize_hierarchy_for_staging.js` |
| `generate_hierarchy_quality_report.js` | Compares production vs. sanitized data, generates before/after report | 2 min | 🟢 | `node generate_hierarchy_quality_report.js --sanitized=<file>` |
| `rebuild_staging_hierarchy_from_sanitized.js` | Truncates staging tables, populates from sanitized artifact | 5 min | 🟡 | `node rebuild_staging_hierarchy_from_sanitized.js --apply --target=staging --artifact=<file>` |
| `validate_staging_hierarchy.js` | Runs 19-test endpoint suite against staging API | 5 min | 🟢 | `node validate_staging_hierarchy.js` |
| `staging_hierarchy_orchestrator.js` | Coordinates all above scripts in correct sequence | 15 min | 🟢/🟡 | `node staging_hierarchy_orchestrator.js --rebuild` |

---

## Key Normalization Rules

**Removed during sanitization:**

✅ **30 unknown_region states** - Placeholder regions eliminated  
✅ **2,430 station-label cities** - Raw monitoring station names filtered  
✅ **496 cross-country duplicates** - Implausible geographic duplicates removed  
✅ **259 invalid coordinates** - Entries with missing/invalid lat/lon rejected  

**Result:**
```
Input:  37 countries, 40 states, 14,920 cities
Output: 37 countries, 10 states, 12,490 cities
```

---

## Validation Gates

### Before Rebuild
- [ ] Sanitized artifact validation: **✅ PASSES**
- [ ] Unknown regions: **0** (was 30)
- [ ] Station-label cities: **0** (was 2,430)

### After Rebuild
- [ ] Staging counts correct: **37 countries, 10 states, ~12,490 cities**
- [ ] No unknown_region: **SELECT COUNT(*) = 0**
- [ ] API tests: **19/19 PASS**
- [ ] Frontend dropdowns: **Working**
- [ ] Manual search: **Working**

---

## Safety Guardrails

✅ **Production Protected**
- Source artifact (`aqi_coverage_map.json`) remains unchanged
- Production database never touched
- Feature flags stay enabled
- Manual search fallback always available

✅ **Staging Isolated**
- Requires explicit `--target=staging` flag
- Requires explicit `--apply` flag
- Dry-run mode default (no changes without flags)
- Transaction-wrapped for atomic rollback

✅ **Transparent & Auditable**
- All decisions logged
- Quality metrics documented
- Before/after comparison generated
- Changes easily reversible

---

## Common Commands

### Generate Report Only (No Database Changes)
```bash
cd server
node sanitize_hierarchy_for_staging.js
node generate_hierarchy_quality_report.js --sanitized=aqi_coverage_map_sanitized_2024-01-15.json
```

### Full Pipeline with Rebuild
```bash
cd server
node staging_hierarchy_orchestrator.js --rebuild
```

### Just Run Tests Against Existing Staging
```bash
cd server
npm start  # Terminal 2
node validate_staging_hierarchy.js  # Terminal 1
```

### Rollback Staging to Production Data
```bash
cd server
node rebuild_staging_hierarchy_from_sanitized.js \
  --apply \
  --target=staging \
  --artifact=aqi_coverage_map.json
```

### Verify No Unknown Regions in Staging
```bash
psql "$DATABASE_URL_STAGING" \
  -c "SELECT COUNT(*) FROM aqi_states WHERE state_name LIKE 'unknown_%';"
# Expected output: 0
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Input file not found" | Run `node sanitize_hierarchy_for_staging.js` first to generate artifact |
| Tests fail: "API not reachable" | Run `npm start` in another terminal to start server |
| Unknown_region still visible | Verify rebuild used `--apply --target=staging` flags |
| Staging tests pass but UI shows nothing | Hard-refresh browser: `Ctrl+Shift+R` |

---

## Expected Outputs

### After Sanitization
```
✅ Sanitization complete!
📊 Statistics:
  Input:  37 countries, 40 states, 14920 cities
  Output: 37 countries, 10 states, 12490 cities
🗑️  Removed: unknown_region: 30, station_label_only: 2430, cross_country_duplicate: 496
✨ Quality Validation: Passes: ✅
```

### After Quality Report
```
✅ Report generated: HIERARCHY_QUALITY_REPORT_2024-01-15.md
Improvements:
  ✅ Unknown regions: -30
  ✅ Station labels: -2430
  ✅ Cross-country dups: -496
```

### After Staging Rebuild
```
🎉 Staging hierarchy rebuild complete from sanitized artifact.
```

### After Validation Tests
```
📋 Staging Hierarchy Validation Suite
Total tests: 19
✅ Passed: 19
❌ Failed: 0
Status: ✅ ALL TESTS PASSED
```

---

## Next Steps After Staging Validation

1. **Review Quality Report**
   - Read `HIERARCHY_QUALITY_REPORT_*.md`
   - Verify metrics meet expectations

2. **Manual Testing (15 min)**
   - Test all hierarchy dropdowns
   - Search for test cities
   - Verify manual search works

3. **Document Results**
   - Save validation logs
   - Commit report to git

4. **Plan Production Rollout**
   - Get stakeholder approval
   - Schedule deployment window
   - Brief team on changes

---

## Documentation Reference

| Document | Purpose | Location |
|----------|---------|----------|
| **STAGING_HIERARCHY_CLEANUP_PIPELINE.md** | Comprehensive technical guide | Root |
| **STAGING_CLEANUP_OPERATIONAL_CHECKLIST.md** | Step-by-step execution guide | Root |
| **HIERARCHY_DATA_QUALITY_ROOT_CAUSE_AND_CLEANUP_PLAN.md** | Root cause analysis & strategy | Root |
| **PRODUCTION_POST_DEPLOY_MONITORING_CHECKLIST.md** | Post-deploy monitoring | Root |

---

## Architecture Overview

```
┌─ Production Artifact (aqi_coverage_map.json) ─┐
│  37 countries, 40 states, 14,920 cities      │
│  Issues: unknown_region, station_labels, dups │
└────────────────────────────────────────────────┘
                    ↓
         ┌────────────────────┐
         │  SANITIZATION      │
         │  (6 rules applied) │
         └────────────────────┘
                    ↓
┌─ Sanitized Artifact ──────────────────────────┐
│  37 countries, 10 states, 12,490 cities      │
│  All quality issues resolved                  │
└────────────────────────────────────────────────┘
                    ↓
         ┌────────────────────┐
         │  QUALITY REPORT    │
         │  Before/After      │
         └────────────────────┘
                    ↓
    ┌──────────────────────────────┐
    │  STAGING DATABASE REBUILD    │
    │  (staging-only, protected)   │
    └──────────────────────────────┘
                    ↓
    ┌──────────────────────────────┐
    │  ENDPOINT VALIDATION         │
    │  (19 tests, all pass ✅)     │
    └──────────────────────────────┘
                    ↓
    ┌──────────────────────────────┐
    │  FRONTEND SMOKE TESTS        │
    │  (UI working correctly ✅)   │
    └──────────────────────────────┘
                    ↓
         ✅ STAGING READY FOR APPROVAL
```

---

## Support & Escalation

**If issues occur:**
1. Consult **Troubleshooting** section above
2. Review relevant section in **STAGING_HIERARCHY_CLEANUP_PIPELINE.md**
3. Check server logs: `tail -f server.log | grep ERROR`
4. Verify database: `psql "$DATABASE_URL_STAGING" -c "SELECT 1;"`

**For production rollout approval:**
1. Confirm all staging tests pass (19/19)
2. Share quality report
3. Get stakeholder sign-off
4. Follow **PRODUCTION_MIGRATION_PLAN.md**

---

**Ready?** Start with: `cd server && node staging_hierarchy_orchestrator.js --rebuild`
