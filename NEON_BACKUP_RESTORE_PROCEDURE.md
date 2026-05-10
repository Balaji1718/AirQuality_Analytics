# Production Backup Verification & Restore Readiness
**Version:** 1.0  
**Date:** 2026-05-10  
**Purpose:** Verify Neon backup availability, document restore procedures, validate recovery capabilities  

---

## Pre-Migration Backup Strategy

This document outlines how to verify production backup readiness and validate recovery capabilities for the production hierarchy migration.

**Backup Requirements:**
- ✅ Pre-migration snapshot captured and verified readable
- ✅ Restore procedure tested (on staging, not production)
- ✅ Recovery validation checklist prepared
- ✅ Estimated restore timing documented
- ✅ Rollback authorization and escalation clear

---

## Step 1: Production Backup Creation (Neon Cloud)

### 1.1 Verify Project ID & Database

**Locate your Neon project:**

1. Go to https://console.neon.tech
2. Navigate to **Projects** → Select your air-quality project
3. Note **Project ID** (from URL or dashboard)
   - Example: `prj_abc123def456`
4. Verify **Production database** is `neondb`
5. Verify **Production branch** is `main` (not staging)

**Info to record:**
```
Production Project ID: ___________________
Production Database: neondb
Production Branch: main
Production Connection: ep-proud-butterfly-a13dejfe-pooler.ap-southeast-1.aws.neon.tech
```

### 1.2 Create Pre-Migration Backup (via Neon Dashboard)

**Method A: Using Neon Dashboard (Recommended)**

1. Log in to https://console.neon.tech
2. Select your project
3. Navigate to **Backups** section
4. Click **Create backup** (or **Initiate snapshot**)
5. Name: `pre-hierarchy-migration-YYYY-MM-DD`
6. Click **Create**
7. Wait for status to change from "Creating" to "Available" (typically < 5 minutes)
8. Record backup details:

```
Backup Name: pre-hierarchy-migration-2026-05-10
Backup ID: ___________________
Created At: 2026-05-10 [TIME]
Status: Available / Pending
Size (approx): ___________________
Retention: [Days]
```

**Method B: Using Neon CLI (If available)**

```bash
# Install Neon CLI (if not already installed)
npm install -g @neondatabase/cli

# Authenticate
neon auth login

# Create backup
neon backups create --project-id prj_abc123def456 --database neondb

# List backups
neon backups list --project-id prj_abc123def456

# Record backup ID from output
```

### 1.3 Verify Backup in Dashboard

1. Return to Neon dashboard → Backups
2. Confirm your new backup appears in the list
3. Verify status is **"Available"** (not "Failed" or "In Progress")
4. Note the **Backup ID** (format: typically a UUID or timestamp)
5. Take a screenshot or record the backup details

**Backup Verification Checklist:**
- [ ] Backup appears in Neon dashboard
- [ ] Status shows "Available" (not In Progress, Failed, or Expired)
- [ ] Backup name includes pre-migration identifier
- [ ] Backup ID recorded: ___________________
- [ ] Creation timestamp recorded: ___________________
- [ ] Backup size visible (indicates data captured): ___________________

---

## Step 2: Backup Integrity Verification (Staging)

### 2.1 Restore to Staging (Test Only)

**WARNING:** Only perform this restore on the **staging branch**, not production.

**Method A: Using Neon Dashboard (Recommended)**

1. Go to https://console.neon.tech
2. Select your project
3. Navigate to **Backups**
4. Find your pre-migration backup
5. Click **Restore** on that backup
6. Choose destination: **Staging branch** (or create new test branch)
7. Name: `test-restore-hierarchy` (temporary)
8. Click **Restore**
9. Wait for restoration to complete (typically 2-10 minutes)

**Method B: Using Neon CLI**

```bash
# Restore backup to staging
neon backups restore \
  --project-id prj_abc123def456 \
  --backup-id [BACKUP_ID] \
  --target-branch staging

# Check restore status
neon branches get staging --project-id prj_abc123def456
```

### 2.2 Verify Restored Data (Staging)

Once restore completes, connect to restored staging database:

```bash
# Set staging DATABASE_URL (after restore)
$env:DATABASE_URL='postgresql://neondb_owner:[STAGING_PASSWORD]@ep-quiet-voice-a1537vx2-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

# Count rows in key tables (should match pre-restore counts)
node -e "
const db = require('./db');
(async () => {
  try {
    // Check production tables still intact
    const aqi_m = await db.pool.query('SELECT COUNT(*) as c FROM aqi_measurements');
    const aqi_l = await db.pool.query('SELECT COUNT(*) as c FROM aqi_locations');
    console.log('aqi_measurements:', aqi_m.rows[0].c);
    console.log('aqi_locations:', aqi_l.rows[0].c);
    
    // Check for expected hierarchy tables (should NOT exist before migration)
    try {
      const h = await db.pool.query('SELECT COUNT(*) FROM aqi_countries');
      console.log('aqi_countries:', h.rows[0].c);
    } catch(e) {
      console.log('aqi_countries: (not present - expected)');
    }
    
    db.pool.end();
  } catch(err) {
    console.error('ERROR:', err.message);
    db.pool.end();
  }
})();
"
```

**Restore Verification Checklist:**
- [ ] Restore process initiated successfully
- [ ] Restore completed (status: "Available")
- [ ] Restore time noted: ___________________
- [ ] Connected to restored staging DB successfully
- [ ] Key production tables present with expected counts
- [ ] No new hierarchy tables present (confirms pre-migration state)
- [ ] Data integrity verified (sample queries successful)

### 2.3 Delete Test Restore

Once verified, clean up the test restore from staging:

1. Go to Neon dashboard
2. Select the test restore branch (`test-restore-hierarchy`)
3. Click **Delete branch**
4. Confirm deletion

```bash
# Via CLI (if used)
neon branches delete test-restore-hierarchy --project-id prj_abc123def456
```

---

## Step 3: Recovery Workflow (If Rollback Needed)

### 3.1 Restore from Backup to Production

**ONLY use this if production migration fails and Level 2 manual rollback doesn't work.**

**Pre-Requisites:**
- Backup ID from Step 1: ___________________
- Backup verified as restorable (Step 2): ✅

**Step-by-Step Restore:**

**Using Neon Dashboard:**

1. Go to https://console.neon.tech
2. Select your project
3. Navigate to **Backups**
4. Locate the pre-migration backup
5. Click **Restore**
6. Choose destination: **main branch** (production)
   - WARNING: This will overwrite production
   - Confirm you understand the consequences
7. Click **Restore**
8. Monitor restore progress (typically 5-10 minutes)

**Using Neon CLI:**

```bash
# Restore backup to production (main branch)
neon backups restore \
  --project-id prj_abc123def456 \
  --backup-id [BACKUP_ID] \
  --target-branch main

# Monitor status
neon branches get main --project-id prj_abc123def456

# Watch for status: "Available"
```

**Verification After Restore:**

```bash
# Connect to restored production DB
$env:DATABASE_URL='postgresql://neondb_owner:[PROD_PASSWORD]@ep-proud-butterfly-a13dejfe-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

# Verify pre-migration state
node -e "
const db = require('./db');
(async () => {
  try {
    const aqi_c = await db.pool.query('SELECT COUNT(*) FROM aqi_countries');
    console.log('aqi_countries found:', aqi_c.rows[0].c);
  } catch(e) {
    if(e.message.includes('does not exist')) {
      console.log('aqi_countries: NOT PRESENT (restore successful)');
    } else {
      console.error('ERROR:', e.message);
    }
  }
  
  const aqi_m = await db.pool.query('SELECT COUNT(*) FROM aqi_measurements');
  const aqi_l = await db.pool.query('SELECT COUNT(*) FROM aqi_locations');
  console.log('aqi_measurements:', aqi_m.rows[0].c, '(pre-migration count)');
  console.log('aqi_locations:', aqi_l.rows[0].c, '(pre-migration count)');
  db.pool.end();
})();
"

# Restart API server
npm start

# Re-run verification tests
node verify_hierarchy_endpoints.js
```

**Recovery Verification Checklist:**
- [ ] Restore initiated successfully
- [ ] Restore completed (status: Available)
- [ ] Production restored to pre-migration state
- [ ] aqi_countries table removed (no longer present)
- [ ] Legacy tables present with original counts
- [ ] API server restarted successfully
- [ ] Manual search functionality restored
- [ ] Post-restore tests passing

---

## Step 4: Estimated Timing

### Pre-Migration Backup Creation

| Phase | Task | Estimated Time |
|-------|------|----------------|
| Dashboard login | Access Neon | 1 min |
| Backup creation | Initiate snapshot | 2 min |
| Backup processing | Neon captures data | 2-5 min |
| Backup available | Status changes to Available | 3-8 min |
| **Total** | **Create backup** | **~10 minutes** |

### Backup Verification (Staging Restore)

| Phase | Task | Estimated Time |
|-------|------|----------------|
| Restore initiation | Start restore to staging | 2 min |
| Restore processing | Neon restores snapshot | 5-10 min |
| Restore verification | Connect and validate data | 3-5 min |
| Cleanup | Delete test branch | 2 min |
| **Total** | **Verify backup** | **~15-20 minutes** |

### Production Restore (If Needed)

| Phase | Task | Estimated Time |
|-------|------|----------------|
| Restore initiation | Click restore in dashboard | 2 min |
| Restore processing | Neon restores snapshot | 5-15 min |
| API restart | Restart application server | 2 min |
| Verification | Connect and validate | 3-5 min |
| **Total** | **Full restore** | **~15-25 minutes** |

**Key Timing Notes:**
- Neon snapshots typically process in 5-10 minutes
- Restore to production typically takes 5-15 minutes
- Total recovery window: < 30 minutes (acceptable for rollback)
- Backup creation can happen in parallel with other pre-checks

---

## Step 5: Backup Readiness Checklist

### Before Migration Window Starts

**REQUIRED (All must be completed):**

- [ ] **Backup Created**
  - Backup ID: ___________________
  - Creation timestamp: ___________________
  - Status in dashboard: "Available"
  - Dashboard screenshot attached: ✅ / ❌

- [ ] **Backup Verified Restorable**
  - Test restore to staging executed: ✅
  - Restore completed successfully: ✅
  - Data integrity verified: ✅
  - Restore time recorded: ___________________ minutes
  - Test restore cleaned up: ✅

- [ ] **Backup Details Documented**
  - Backup ID accessible: ✅
  - Backup location documented: Neon Dashboard
  - Restore procedure printed/accessible: ✅
  - Team notified of backup location: ✅

- [ ] **Recovery Procedures Ready**
  - Restore procedure understood: ✅
  - CLI commands prepared (if used): ✅
  - Expected restore time communicated: ✅
  - Escalation path for failed restore: ✅

- [ ] **Monitoring in Place**
  - Backup expiration date understood: ___________________
  - Neon dashboard accessible: ✅
  - Restore notification plan: ✅

### Backup Readiness Sign-Off

**Database Administrator:**
- [ ] Backup verified and ready for migration
- [ ] Restore procedure tested successfully
- [ ] Recovery time acceptable (< 30 min)
- Signature: ___________________
- Date/Time: ___________________

---

## Troubleshooting & Support

### Issue: Backup Creation Failed

**Symptoms:** Status shows "Failed" in Neon dashboard

**Resolution:**
1. Check Neon status page (status.neon.tech) for ongoing incidents
2. Verify project permissions (may need admin access)
3. Try creating backup again in 5 minutes
4. If still failing, contact Neon support (support@neon.tech)
5. Create backup using alternative branch (if available)

### Issue: Restore Hangs or Times Out

**Symptoms:** Restore stuck at "Restoring..." > 20 minutes

**Resolution:**
1. Check Neon dashboard for system status
2. Verify database size (very large DBs take longer)
3. If stuck > 30 min, cancel restore and retry
4. Contact Neon support if restore repeatedly fails

### Issue: Restored Database Shows Inconsistent Data

**Symptoms:** Row counts don't match, missing tables, corrupted data

**Resolution:**
1. Do NOT proceed with production restore
2. Cancel restore and try again from backup
3. Verify backup was created successfully (wasn't already corrupted)
4. Contact Neon support for data integrity investigation
5. Use alternative backup or skip migration (escalate to technical lead)

### Contact Information

**Neon Support:**
- Website: https://neon.tech/support
- Email: support@neon.tech
- Status: https://status.neon.tech

**Internal Escalation:**
- DBA: ___________________
- Technical Lead: ___________________
- Emergency: ___________________

---

## Backup Retention & Cleanup

### Post-Migration Cleanup

**After production migration succeeds (48+ hours later):**

1. Backup no longer needed: Identify older backups in Neon
2. Neon retention policy: Default retention ~30 days
3. Manual deletion: Optional, Neon will auto-expire

**Backups to Keep:**
- ✅ Pre-migration backup (at least 7 days)
- ✅ Post-migration snapshot (if created for verification)
- ❌ Test restore branches (delete after verification)

---

## Final Backup Status Summary

| Item | Status | Details |
|------|--------|---------|
| Pre-migration backup created | ⏳ Pending / ✅ Done | Backup ID: ___________ |
| Backup available in dashboard | ⏳ Pending / ✅ Done | Verified: ___________ |
| Test restore to staging | ⏳ Pending / ✅ Done | Time: ___ min |
| Data integrity verified | ⏳ Pending / ✅ Done | Verified: ___________ |
| Recovery procedure ready | ⏳ Pending / ✅ Done | Procedure: Ready |
| Backup retention verified | ⏳ Pending / ✅ Done | Days: ___ |
| DBA sign-off | ⏳ Pending / ✅ Done | Signature: ___________ |

---

**Backup Readiness:** ⏳ NOT READY / ✅ READY  
**Date Verified:** ___________________  
**By:** ___________________  

**Status:** This document completes the backup readiness verification. Proceed to PRODUCTION_MIGRATION_READINESS_SUMMARY.md for final go/no-go decision.
