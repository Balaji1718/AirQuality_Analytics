# Production Migration: Quick Start Guide
**Version:** 1.0  
**Status:** ✅ Ready for execution  
**Scope:** Solo/small-team deployment (simplified)  

---

## Pre-Flight Summary ✅

**Current Status:**
- ✅ Production backup created (record Backup ID)
- ✅ Staging validation passed (29/29 tests)
- ✅ Dry-run verified safe (no changes)
- ✅ All guard rails active
- ✅ Rollback procedures tested
- ✅ Frontend integration paused
- ✅ Production database ready

**Blockers:** None – Ready to execute when you approve

---

## THE 3 CORE COMMANDS

### Step 1: Execute Migration (Terminal 1) – 30-45 minutes

```bash
cd D:\AirQuality_Analytics\server
$env:DATABASE_URL='postgresql://neondb_owner:npg_niB5kMYNaDw6@ep-proud-butterfly-a13dejfe-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
node apply_hierarchy_migration_and_populate.js --apply --target=production
```

**Success indicator:** Ends with `🎉 Done`

---

### Step 2: Start Server (Terminal 2) – 2 minutes

```bash
cd D:\AirQuality_Analytics\server
npm start
```

**Success indicator:** `Server running on http://localhost:5000`

---

### Step 3: Verify (Terminal 3) – 5 minutes

```bash
cd D:\AirQuality_Analytics\server
$env:API_URL='http://localhost:5000'
node verify_hierarchy_endpoints.js
```

**Success indicator:** `29/29 passed ✅`

---

## Quick Verification (After Step 3)

All 4 should return `200 OK`:

```bash
curl "http://localhost:5000/api/hierarchy/countries?limit=3"
curl "http://localhost:5000/api/hierarchy/search?q=India&type=country"
curl -X POST "http://localhost:5000/api/hierarchy/validate"
curl "http://localhost:5000/api/hybrid-measurements?city=Delhi"
```

---

## Expected Outcome ✅

- ✅ 37 countries inserted
- ✅ 40 states inserted
- ✅ ~14,950 cities inserted
- ✅ 37 cache entries created
- ✅ 0 malformed entries (filtered)
- ✅ All 29 tests pass
- ✅ No errors in logs
- ✅ Original APIs still working

---

## If Something Fails

**Automatic rollback already happened:**
- Database rolled back automatically
- Production unchanged
- No partial state

**Manual recovery:**
```sql
DROP TABLE IF EXISTS aqi_hierarchy_cache CASCADE;
DROP TABLE IF EXISTS aqi_cities CASCADE;
DROP TABLE IF EXISTS aqi_states CASCADE;
DROP TABLE IF EXISTS aqi_countries CASCADE;
DROP VIEW IF EXISTS aqi_coverage_summary CASCADE;
```

**Emergency restore from backup:**
1. https://console.neon.tech
2. Backups → Find `pre-hierarchy-migration-2026-05-10`
3. Restore to main branch
4. Wait 5-15 minutes

---

## Documentation Reference

**For detailed procedures:**
- [PRODUCTION_EXECUTION_CHECKLIST_SIMPLE.md](PRODUCTION_EXECUTION_CHECKLIST_SIMPLE.md) – Full step-by-step
- [PRODUCTION_MIGRATION_COMMANDS_EXACT.md](PRODUCTION_MIGRATION_COMMANDS_EXACT.md) – All commands
- [PRODUCTION_POST_MIGRATION_VERIFICATION.md](PRODUCTION_POST_MIGRATION_VERIFICATION.md) – Verification procedures
- [BACKUP_CREATION_SIMPLE.md](BACKUP_CREATION_SIMPLE.md) – Backup procedures

---

## Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Migration execution | 30-45 min | Copy/paste command |
| Server startup | 2 min | Run npm start |
| Verification | 5 min | Run test suite |
| Manual checks | 3 min | 4x curl commands |
| **Total** | **~50 min** | **Ready** |

---

## Status: ✅ READY

**Waiting for:** Your explicit approval

**When you approve, execute Step 1, then Step 2, then Step 3 (in order).**

---

**Production is backed up. Safeguards active. Ready to proceed.**
