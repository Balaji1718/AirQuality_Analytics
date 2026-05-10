# Production Rollback Procedure
**Version:** 1.0  
**Date:** 2026-05-10  
**Purpose:** Immediate rollback if production migration fails or causes critical issues  

---

## Overview

This document outlines three rollback scenarios with timelines and exact procedures. Choose the appropriate level based on issue severity.

**Rollback Levels:**
1. **Automatic Rollback** (< 1 min) – Migration transaction fails automatically
2. **Manual SQL Rollback** (< 5 min) – Remove new tables, keep existing data intact
3. **Backup Restore** (5-10 min) – Full database restore from pre-migration snapshot

---

## Rollback Level 1: Automatic Rollback (< 1 minute)

### When to Use
- Migration command fails during execution
- Transaction error detected (e.g., constraint violation)
- Connection lost during migration
- Validation pre-checks fail

### What Happens Automatically
```javascript
// Migration runner catches error and auto-rolls back:
try {
  await client.query('BEGIN');
  // ... apply migration ...
  // ... populate data ...
  // ... generate cache ...
  await client.query('COMMIT');
} catch (err) {
  try {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed, rolled back:', err.message);
  } catch (rollbackErr) {
    console.error('⚠️ Rollback failed:', rollbackErr.message);
  }
  process.exit(1);
}
```

### Verification After Auto-Rollback
```bash
# Check that NO new tables were created:
psql "postgresql://neondb_owner:...prod..."
\dt

# Expected: Only existing tables (aqi_measurements, aqi_locations, aqi_coverage, etc.)
# New tables should NOT be present:
#  - aqi_countries
#  - aqi_states
#  - aqi_cities
#  - aqi_hierarchy_cache
#  - aqi_coverage_summary (view)
```

### Required Action
1. ✅ Check logs for error message
2. ✅ Fix underlying issue (e.g., invalid coverage map data)
3. ✅ Re-run migration with --apply when ready
4. ✅ No manual cleanup needed (auto-rolled back)

---

## Rollback Level 2: Manual SQL Rollback (< 5 minutes)

### When to Use
- Migration completed but tests fail
- Data corruption detected post-deployment
- API endpoints returning errors
- Cache generation incomplete

### Step 1: Stop Production API Server
```bash
# Stop the running node server
# Option 1: Ctrl+C in terminal
# Option 2: Kill process
Get-Process node | Stop-Process -Force
```

### Step 2: Connect to Production Database
```bash
psql "postgresql://neondb_owner:npg_niB5kMYNaDw6@ep-proud-butterfly-a13dejfe-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Verify connection:
\dt
# Should show both old and new tables
```

### Step 3: Execute Rollback SQL
```sql
-- Begin transaction
BEGIN;

-- 1. Drop view (depends on table)
DROP VIEW IF EXISTS aqi_coverage_summary;

-- 2. Drop new hierarchy tables
DROP TABLE IF EXISTS aqi_hierarchy_cache;
DROP TABLE IF EXISTS aqi_cities;
DROP TABLE IF EXISTS aqi_states;
DROP TABLE IF EXISTS aqi_countries;

-- 3. Commit
COMMIT;

-- Verify rollback
\dt
-- Should show ONLY original tables (no aqi_countries, etc.)
```

### Step 4: Verify Data Integrity
```sql
-- Verify existing data untouched
SELECT COUNT(*) FROM aqi_measurements;
-- Should show original count (not 0)

SELECT COUNT(*) FROM aqi_locations;
-- Should show original count (not 0)

-- Verify no new tables exist
\dt aqi_countries
-- Should return: "Did not find any relation named"
```

### Step 5: Restart Production API
```bash
cd server
Set-Item -Path env:PORT -Value 5000
Set-Item -Path env:DATABASE_URL -Value 'postgresql://...prod...'
npm start

# Expected output:
# ✅ Neon Database connected
# ✅ Table exists with generated recorded_hour column
# Server running on http://localhost:5000

# Verify manual search still works:
curl http://localhost:5000/api/locations?query=Delhi
# Should return 200 OK with location data
```

### Step 6: Confirm Rollback Complete
- [ ] All new tables removed
- [ ] Original data intact
- [ ] API responding normally
- [ ] Manual search functional
- [ ] No errors in logs

### Timeline
```
1. Stop server          ~30 seconds
2. Connect DB           ~10 seconds
3. Execute SQL          ~20 seconds
4. Verify data          ~30 seconds
5. Restart server       ~30 seconds
Total: ~2-3 minutes
```

---

## Rollback Level 3: Backup Restore (5-10 minutes)

### When to Use
- Manual SQL rollback fails or doesn't resolve issue
- Database corruption suspected
- Need to restore to pre-migration state completely
- Neon support assistance available

### Prerequisites
- Pre-migration backup snapshot captured and verified (during pre-migration checklist)
- Backup ID known: ___________________
- Neon dashboard or CLI access available

### Option A: Neon Dashboard Restore

#### Step 1: Access Neon Dashboard
```
URL: https://console.neon.tech
Project: Air Quality Analytics
Database: neondb
```

#### Step 2: Navigate to Backups
```
Project → Backups → Find pre-migration backup
Backup ID: ___________________
Timestamp: ___________________
Status: Ready to restore
```

#### Step 3: Initiate Restore
```
1. Click "Restore from this backup"
2. Target database: neondb (replace current)
3. Confirm: "Yes, restore this backup"
4. Wait for restore to complete (5 min)
```

#### Step 4: Verify Restore Completed
```
Status should show: "Restore Complete"
Database size: ___________________
Restore time: ___________________
```

### Option B: Neon CLI Restore

```bash
# List available backups
neon backup list --project-id <project-id>

# Restore from specific backup ID
neon backup restore --project-id <project-id> --from-backup-id <backup-id>

# Wait for restore to complete
# Check status:
neon backup list --project-id <project-id>
# Status should show: "restored"
```

### Step 5: Verify Database After Restore

```bash
# Connect to restored database
psql "postgresql://neondb_owner:...@ep-proud-butterfly-...neondb"

# Check table count (should be pre-migration state)
\dt

# Verify no new hierarchy tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_name LIKE 'aqi_%'
  AND table_name NOT IN ('aqi_measurements', 'aqi_locations', 'aqi_coverage');

# Expected: No results (or only original tables)

# Verify data counts
SELECT COUNT(*) FROM aqi_measurements;
SELECT COUNT(*) FROM aqi_locations;
# Should match pre-migration counts
```

### Step 6: Restart Production API

```bash
cd server
Set-Item -Path env:PORT -Value 5000
Set-Item -Path env:DATABASE_URL -Value 'postgresql://...prod...'
npm start
```

### Step 7: Verify API Functionality

```bash
# Test manual search
curl http://localhost:5000/api/locations?query=Delhi
# Expected: 200 OK

# Test historical data
curl http://localhost:5000/api/historical?city=Delhi
# Expected: 200 OK

# Verify hierarchy endpoints DO NOT exist (or return 404)
curl http://localhost:5000/api/hierarchy/countries
# Expected: 404 (not implemented) or error
```

### Timeline for Full Restore
```
1. Access Neon dashboard          ~1 minute
2. Initiate backup restore        ~30 seconds
3. Wait for restore               ~5 minutes
4. Verify restore completed       ~1 minute
5. Connect and verify data        ~1 minute
6. Restart API                    ~1 minute
Total: ~8-10 minutes
```

---

## Decision Tree: Which Rollback Level?

```
Migration failed during execution?
├─ Yes → Level 1 (Automatic) – Already rolled back
└─ No: Check test results

Tests or API showing critical errors?
├─ Yes: 
│  ├─ Can manual SQL rollback fix it? → Level 2 (Manual SQL)
│  └─ Need full restore? → Level 3 (Backup Restore)
└─ No: Fix identified issue, no rollback needed

Level 2 rollback successful?
├─ Yes → Done, resume normal monitoring
└─ No → Proceed to Level 3 (Backup Restore)

Level 3 restore successful?
├─ Yes → Done, post-mortem review required
└─ No → Contact Neon support emergency line
```

---

## Critical Information Card (Print & Keep Handy)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRODUCTION ROLLBACK QUICK REFERENCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

LEVEL 1: Automatic (< 1 min)
├─ Wait for error → Auto-rolls back
└─ Verify no new tables created

LEVEL 2: Manual SQL (< 5 min)
├─ Stop API: Get-Process node | Stop-Process -Force
├─ DROP 5 objects: view + 4 tables
├─ Restart API: npm start
└─ Verify: \dt, SELECT COUNT(*) FROM aqi_measurements

LEVEL 3: Backup Restore (5-10 min)
├─ https://console.neon.tech → Backups
├─ Select pre-migration backup ID: ___________________
├─ Click "Restore from this backup"
├─ Wait 5 min for restore
└─ Verify: \dt, npm start

CONTACT INFO:
- On-call engineer: ___________________
- DBA: ___________________
- Neon support: https://console.neon.tech/support
- Emergency escalation: ___________________

PRODUCTION DB:
- Host: ep-proud-butterfly-a13dejfe-pooler.ap-southeast-1.aws.neon.tech
- Database: neondb
- User: neondb_owner

BACKUP ID:
- Timestamp: ___________________
- Backup ID: ___________________
- Size: ___________________

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Post-Rollback Actions

### Immediate (< 30 min after rollback)
- [ ] Notify team: "Rollback completed successfully"
- [ ] Document issue in incident log
- [ ] Collect error logs and screenshots
- [ ] Note exact failure point

### Within 1 Hour
- [ ] Root cause analysis started
- [ ] Identify fix required
- [ ] Code review scheduled
- [ ] Plan remediation

### Within 24 Hours
- [ ] Post-mortem meeting scheduled
- [ ] Lessons learned documented
- [ ] Fixes implemented and tested on staging
- [ ] New migration date proposed

---

## Escalation Path (If Rollback Fails)

**Level 1 auto-rollback failed?**
→ Proceed to Level 2 (Manual SQL)

**Level 2 manual SQL rollback failed?**
→ Proceed to Level 3 (Backup Restore)

**Level 3 backup restore failed?**
→ Contact Neon Support Emergency: https://console.neon.tech/support
- Include: Error message, backup ID, timestamps
- RTO: Neon support team (typically 15 min response)

**All rollbacks failed?**
→ Escalate to VP Engineering / Infrastructure Lead
- May require database rebuild (RTO: hours)
- Last resort: Restore to different instance + DNS switch

---

**Document Status:** Ready for Use  
**Last Updated:** 2026-05-10  
**Tested:** Yes (on staging dry-runs)  
**Emergency Contact:** [Configured in phase 5 above]
