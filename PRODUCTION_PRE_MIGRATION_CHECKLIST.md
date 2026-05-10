# Production Pre-Migration Checklist
**Date:** 2026-05-10  
**Status:** To Be Completed Before Execution  
**Duration:** Estimated 2 hours (to complete all items)  

---

## Phase 0: Approval & Authorization (Before Any Action)

- [ ] **Migration plan reviewed** – PRODUCTION_MIGRATION_PLAN.md approved
- [ ] **Staging results verified** – FOLLOW_UP_DATA_QUALITY_REPORT.md reviewed
- [ ] **Rollback procedure confirmed** – Understood and practiced
- [ ] **Risk mitigation approved** – All high/medium risks acknowledged
- [ ] **Business owner sign-off** – Approved for production deployment
- [ ] **Technical lead sign-off** – Confirmed safety measures in place

---

## Phase 1: Environment Preparation (24 Hours Before Migration)

### 1.1 Database Backup & Snapshot

- [ ] **Production backup initiated**
  - Command: `neon backup create --project-id <project> --database neondb`
  - Status: <check Neon dashboard>
  - Backup ID: ___________________
  - Timestamp: ___________________
  - Size: ___________________

- [ ] **Backup verified readable**
  - Command: `neon backup list --project-id <project>`
  - Confirm backup appears in list
  - Backup details recorded above

- [ ] **Restore procedure tested** (in staging only)
  - Command: `neon backup restore --from-backup-id <id>`
  - Applied to **staging database only**
  - Data integrity verified
  - Restore time noted: ___________________

- [ ] **Backup credentials secured**
  - Connection details stored in password manager
  - Restore procedure printed/accessible
  - Team notified of backup location

### 1.2 Production Database Health Check

- [ ] **Database connectivity confirmed**
  ```bash
  psql "postgresql://neondb_owner:...@ep-proud-butterfly-...neondb?sslmode=require"
  \dt
  ```
  - Result: ✅ Connected
  - Tables present: aqi_measurements, aqi_locations, aqi_coverage, [others]

- [ ] **Database performance baseline**
  ```bash
  SELECT COUNT(*) FROM aqi_measurements;
  SELECT COUNT(*) FROM aqi_locations;
  ```
  - aqi_measurements rows: ___________________
  - aqi_locations rows: ___________________
  - Query time: ___________________

- [ ] **Database size**
  ```sql
  SELECT pg_size_pretty(pg_database_size('neondb'));
  ```
  - Result: ___________________

- [ ] **No long-running transactions**
  ```sql
  SELECT * FROM pg_stat_activity WHERE state != 'idle';
  ```
  - Result: ✅ No blocking queries

### 1.3 Production API Baseline

- [ ] **API server running normally**
  - Endpoint: http://localhost:5000
  - Status: ✅ Running
  - Version: ___________________

- [ ] **Existing API endpoints functional**
  - [ ] `GET /api/hybrid-measurements` – Manual search working
  - [ ] `GET /api/locations` – Fallback search working
  - [ ] `GET /api/current` – Fresh data collection working
  - [ ] `GET /api/historical` – Historical queries working

- [ ] **Performance baseline captured**
  ```bash
  curl -w "Response time: %{time_total}s\n" http://localhost:5000/api/hybrid-measurements?city=Delhi
  ```
  - Average response time: ___________________
  - Cached response time: ___________________

### 1.4 Monitoring & Alerting Preparation

- [ ] **Monitoring dashboards ready**
  - Dashboard URL: ___________________
  - Metrics visible: Response time, Error rate, Database connections
  - Alerts configured: Yes / No

- [ ] **Alert recipients configured**
  - [ ] Ops team email: ___________________
  - [ ] On-call engineer: ___________________
  - [ ] DBA contact: ___________________
  - [ ] Project lead: ___________________

- [ ] **Escalation procedure documented**
  - Who to contact if P1 issue: ___________________
  - Who to contact for rollback: ___________________
  - Emergency contact list shared: Yes / No

- [ ] **Log aggregation active**
  - [ ] Application logs streaming: Yes / No
  - [ ] Database logs visible: Yes / No
  - [ ] Error patterns baseline established: Yes / No

### 1.5 Team Communication & On-Call

- [ ] **On-call engineer assigned**
  - Name: ___________________
  - Contact: ___________________
  - Briefed on plan: Yes / No
  - Briefed on rollback: Yes / No

- [ ] **Development team notified**
  - Slack/Email announcement sent: Yes / No
  - Maintenance window posted: Yes / No
  - Expected duration communicated: 30 minutes

- [ ] **Frontend team notified**
  - Hierarchy API integration remains paused: Confirmed
  - Manual search still primary: Confirmed
  - Activation timeline TBD: Confirmed

- [ ] **Stakeholders notified**
  - Maintenance window announced: Yes / No
  - Expected impact: None (manual search unaffected)
  - Point of contact: ___________________

---

## Phase 2: Code & Configuration Verification (12 Hours Before)

### 2.1 Migration Script Verification

- [ ] **apply_hierarchy_migration_and_populate.js reviewed**
  - [ ] Guard rails active (--apply, --target required)
  - [ ] Transaction wrapping confirmed (BEGIN/COMMIT/ROLLBACK)
  - [ ] Validation pre-flight check present
  - [ ] Coverage map sanitization active
  - [ ] Error handling complete

- [ ] **Cleanup script tested** (on staging)
  - [ ] cleanup_malformed_countries.js executed successfully
  - [ ] Guarded flags working (--apply, --target=staging)
  - [ ] Rollback functionality verified
  - [ ] Counts logged correctly

- [ ] **Schema migration SQL reviewed**
  - [ ] migration_hierarchical_locations.sql contains all 4 tables
  - [ ] CREATE INDEX statements present
  - [ ] Foreign key constraints correct
  - [ ] View creation included
  - [ ] IF NOT EXISTS clauses present (idempotent)

### 2.2 Validation Logic Verification

- [ ] **isValidCountryName() function reviewed**
  - [ ] Rejects numeric-only keys
  - [ ] Enforces 2-100 char length
  - [ ] Requires alphabetic characters
  - [ ] Works on staging data

- [ ] **sanitizeIso2() function reviewed**
  - [ ] Converts to uppercase
  - [ ] Validates 2-3 letter format
  - [ ] Returns null for invalid values
  - [ ] Tested on sample data

- [ ] **validateCoverageMap() function reviewed**
  - [ ] Identifies all invalid keys
  - [ ] Returns array of invalid entries
  - [ ] Exported and callable

- [ ] **Production coverage map inspected**
  - File: server/aqi_coverage_map.json
  - Size: ___________________
  - Total countries: ___________________
  - Expected invalid keys: ___________________

### 2.3 Environment Variables

- [ ] **Production DATABASE_URL set correctly**
  ```
  postgresql://neondb_owner:...@ep-proud-butterfly-...neon.tech/neondb?sslmode=require&channel_binding=require
  ```
  - Verified correct host: ✅ ep-proud-butterfly (not staging)
  - Verified SSL required: ✅ sslmode=require
  - Verified channel binding: ✅ channel_binding=require
  - Double-checked: Yes (prevents cross-environment mistakes)

- [ ] **PORT configured correctly**
  - Production PORT: 5000
  - No conflicts with other services: Yes / No

- [ ] **No sensitive data in code**
  - Database URL not hardcoded in scripts
  - API keys not exposed
  - Credentials via environment only

---

## Phase 3: Dry-Run Testing (6 Hours Before)

### 3.1 Dry-Run Migration Command

- [ ] **Dry-run executed** (with actual connection to prod, but no --apply)
  ```bash
  cd server
  $env:DATABASE_URL='postgresql://...prod...'
  node apply_hierarchy_migration_and_populate.js
  ```
  - Result: "Dry run only. No database changes were made."
  - Confirmed: ✅ No --apply flag triggered dry-run mode

- [ ] **Dry-run output examined**
  - No actual queries executed: ✅ Confirmed
  - No tables created: ✅ Confirmed
  - No data modified: ✅ Confirmed

### 3.2 Staging Validation Reconfirmed

- [ ] **Latest staging test results verified**
  - Verification suite: 29/29 passing ✅
  - Malformed entries: 0 ✅
  - Countries count: 37 ✅
  - States count: 40 ✅
  - Cities count: ~14,950 ✅

- [ ] **Staging API still responding**
  - GET /api/hierarchy/countries – 200 OK
  - GET /api/hierarchy/search – 200 OK
  - POST /api/hierarchy/validate – 200 OK

---

## Phase 4: Documentation & Procedures (Final Review)

### 4.1 Runbooks & Procedures

- [ ] **Production migration commands documented**
  - [ ] Command 1: Dry-run
  - [ ] Command 2: Execute migration
  - [ ] Command 3: Cleanup (if needed)
  - [ ] Command 4: Inspection

- [ ] **Rollback procedure documented and understood**
  - [ ] Automatic rollback (transaction auto-rollback)
  - [ ] Manual rollback (DROP statements)
  - [ ] Restore from backup (Neon support)

- [ ] **Verification workflow documented**
  - [ ] Start production API
  - [ ] Run 29-test suite
  - [ ] Smoke tests
  - [ ] Existing API check

- [ ] **Monitoring checklist prepared**
  - [ ] Metrics to watch listed
  - [ ] Alert thresholds defined
  - [ ] Escalation procedure clear

### 4.2 Documentation Reviewed

- [ ] **PRODUCTION_MIGRATION_PLAN.md reviewed** – Approved
- [ ] **FOLLOW_UP_DATA_QUALITY_REPORT.md reviewed** – Staging results confirmed
- [ ] **Migration commands documented** – In this checklist
- [ ] **Rollback steps memorized** – Practiced if possible
- [ ] **Guard rails confirmed active** – Verified above

---

## Phase 5: Final Authorization (1 Hour Before Migration Window)

### 5.1 Go/No-Go Decision

- [ ] **All pre-migration items completed** – Yes / No
- [ ] **Staging validation passed** – Yes / No
- [ ] **Backup verified** – Yes / No
- [ ] **Rollback procedure ready** – Yes / No
- [ ] **Team briefed** – Yes / No
- [ ] **Monitoring active** – Yes / No

### 5.2 Final Sign-Offs

**Technical Lead:**
- [ ] Approved for production migration
- [ ] Signature: _________________________
- [ ] Date/Time: _________________________

**Database Administrator:**
- [ ] Backup verified and ready
- [ ] Restore procedure tested
- [ ] Monitoring configured
- [ ] Signature: _________________________
- [ ] Date/Time: _________________________

**Operations Lead:**
- [ ] Maintenance window open
- [ ] On-call engineer active
- [ ] Escalation contacts ready
- [ ] Signature: _________________________
- [ ] Date/Time: _________________________

**Project Lead / Product Owner:**
- [ ] Business impact understood (zero downtime)
- [ ] Manual search fallback confirmed active
- [ ] Frontend integration timeline approved (paused until prod succeeds)
- [ ] Signature: _________________________
- [ ] Date/Time: _________________________

---

## Migration Window Go Signal

**All Pre-Migration Checks Passed:**
```
Date/Time Window: ___________________
Duration: ~30 minutes
Expected Completion: ___________________
Rollback Authority: ___________________
Go/No-Go Decision: ___________________
```

**Approved By:**
- Technical Lead: ✅ / ❌
- DBA: ✅ / ❌
- Ops Lead: ✅ / ❌
- Project Lead: ✅ / ❌

---

**Checklist Status:** ⏳ Ready to Begin / ✅ Completed / ❌ Blocked

**Date Completed:** ___________________  
**By:** ___________________  
**Notes:** ___________________

---

**Next Step:** When all items checked, proceed to PRODUCTION_MIGRATION_EXECUTION.md
