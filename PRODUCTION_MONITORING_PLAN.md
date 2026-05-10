# Production Monitoring & Alert Plan (First 24 Hours)
**Version:** 1.0  
**Date:** 2026-05-10  
**Duration:** Active Monitoring for First 24 Hours Post-Migration  

---

## Overview

This plan outlines real-time monitoring and alerting strategy for the first 24 hours after production migration. Success indicators and escalation thresholds are defined to catch issues early.

**Monitoring Windows:**
- **Window 1 (0-2 hours):** Real-time (every 15 min), High alert level
- **Window 2 (2-8 hours):** Frequent (every 30 min), Medium alert level
- **Window 3 (8-24 hours):** Standard (every 2 hours), Standard alert level

---

## Pre-Deployment Setup (Before Migration)

### Alert Configuration

- [ ] **Slack channel created:** #hierarchy-api-migration
- [ ] **Alert recipients added:**
  - [ ] On-call engineer
  - [ ] Technical lead
  - [ ] Database administrator
  - [ ] Operations lead
  - [ ] Project manager

- [ ] **Email alerts configured** (to backup channel)
- [ ] **PagerDuty integration** (if available)
- [ ] **SMS alerts** for critical severity

### Monitoring Dashboards Prepared

- [ ] **Application dashboard** (response times, errors)
- [ ] **Database dashboard** (connections, queries)
- [ ] **API dashboard** (endpoint traffic)
- [ ] **Error logs** aggregated and searchable

### Baseline Metrics Captured (Before Migration)

```
Existing API Performance (Pre-Migration):
- /api/hybrid-measurements: avg 150ms, p99 500ms
- /api/locations: avg 100ms, p99 300ms
- /api/historical: avg 200ms, p99 600ms
- Error rate: <0.05%
- Database connections: 8-15 active
```

**Record baseline values:**
- Avg response time: ___________________
- P99 response time: ___________________
- Error rate: ___________________
- Database connections: ___________________

---

## Window 1: Real-Time Monitoring (0-2 Hours Post-Migration)

### Monitoring Frequency
- **Check every 15 minutes**
- **Active monitoring by:** On-call engineer
- **Alert threshold:** Any non-normal value

### Metrics to Monitor

#### 1.1 Database Connectivity

**Check:**
```bash
curl -I http://localhost:5000/api/hierarchy/countries
# Expected: 200 OK
```

| Metric | Expected | Alert If |
|--------|----------|----------|
| DB Connection Status | Connected ✅ | Connection error ❌ |
| Connection Pool | 5-15 active | >20 or <2 |
| Slow Queries | None | Any query >5s |

**Action if Alert:**
- Verify network connectivity
- Check database credentials
- Review recent changes
- Contact DBA if persists

#### 1.2 API Response Times

**Check:**
```bash
# Hierarchy endpoints
time curl http://localhost:5000/api/hierarchy/countries
time curl http://localhost:5000/api/hierarchy/search?q=India
time curl -X POST http://localhost:5000/api/hierarchy/validate

# Existing endpoints (backward compatibility)
time curl http://localhost:5000/api/hybrid-measurements?city=Delhi
```

| Metric | Expected | Yellow Alert | Red Alert |
|--------|----------|--------------|-----------|
| /countries | <100ms | >200ms | >500ms |
| /search | <150ms | >300ms | >600ms |
| /validate | <100ms | >200ms | >500ms |
| /hybrid-measurements | <150ms | >300ms | >600ms |
| /locations | <100ms | >200ms | >400ms |

**Action if Yellow Alert:**
- Monitor closely, may indicate load spike
- Check if other processes running
- Begin log review

**Action if Red Alert:**
- Immediate investigation
- Check database performance
- Review application logs for errors
- Consider rollback if persists

#### 1.3 Error Rates

**Check:**
```bash
# Count errors in logs (last 15 min)
# Look for: 500 errors, exceptions, timeouts
grep -c "ERROR\|Exception\|500" app.log | tail -15m

# API test errors
node verify_hierarchy_endpoints.js 2>&1 | grep -c "FAIL\|Error"
```

| Metric | Expected | Yellow | Red |
|--------|----------|--------|-----|
| HTTP 5xx errors | 0 | >2 | >5 |
| API test failures | 0/29 | 1-2 fail | 3+ fail |
| Database errors | 0 | >1 | >3 |
| Timeout errors | 0 | >1 | >3 |

**Action if Yellow Alert:**
- Review which endpoints failing
- Check application logs
- Monitor next 5 checks closely

**Action if Red Alert:**
- Stop traffic to affected endpoint
- Escalate to technical lead
- Prepare rollback if needed

#### 1.4 Data Integrity Checks

**Check (Every 30 min in Window 1):**
```sql
-- Verify data hasn't changed unexpectedly
SELECT COUNT(*) FROM aqi_countries;
-- Expected: 37

SELECT COUNT(*) FROM aqi_hierarchy_cache;
-- Expected: 37

-- Check for malformed entries
SELECT COUNT(*) FROM aqi_countries 
WHERE country_name ~ '^\d+$';
-- Expected: 0
```

| Check | Expected | Alert If |
|-------|----------|----------|
| Countries count | 37 | ≠ 37 |
| Cache count | 37 | ≠ 37 |
| Malformed entries | 0 | > 0 |
| Orphaned records | 0 | > 0 |

**Action if Alert:**
- Investigate immediately
- Check migration logs
- Review for data corruption
- Escalate to DBA

#### 1.5 Cache Performance

**Check:**
```bash
# Test cache hit (second request should be faster)
curl http://localhost:5000/api/hierarchy/countries -w "%{time_total}\n"
curl http://localhost:5000/api/hierarchy/countries -w "%{time_total}\n"
# Second should be <50ms (cache hit)
```

| Metric | Expected | Alert If |
|--------|----------|----------|
| Cache hit time | <50ms | >100ms |
| Cache miss time | <200ms | >400ms |
| Cache hit rate | >80% | <70% |

**Action if Alert:**
- Verify cache generation completed
- Check cache table not empty
- Review node-cache configuration
- May indicate memory pressure

### Window 1 Monitoring Checklist

Every 15 minutes, check:
- [ ] DB connection: Connected ✅
- [ ] /countries response: <100ms
- [ ] /search response: <150ms
- [ ] Error rate: 0 or <0.1%
- [ ] Test suite: 29/29 passing
- [ ] Logs: No critical errors
- [ ] API responses: Valid JSON
- [ ] Cache working: Hit <50ms
- [ ] Manual search: Still working

**Log timestamp each check:**
```
15 min:  ✅ All good
30 min:  ✅ All good
45 min:  ✅ All good
60 min:  ✅ All good
...
```

---

## Window 2: Frequent Monitoring (2-8 Hours Post-Migration)

### Monitoring Frequency
- **Check every 30 minutes**
- **Active monitoring by:** On-call engineer + Technical lead
- **Alert threshold:** Deviation from baseline or error conditions

### Extended Metrics

#### 2.1 Load Testing (Optional, if traffic available)

```bash
# Simulate moderate load (if production traffic allows)
# 10 requests/second for 2 minutes
ab -n 1000 -c 10 http://localhost:5000/api/hierarchy/countries

# Analyze results:
# Requests per second: ___________________
# Failed requests: ___________________
# Average response time: ___________________
# Max response time: ___________________
```

**Expected under moderate load:**
- Requests/sec: >100
- Failed: <1%
- Avg time: <200ms
- Max time: <1000ms

#### 2.2 Feature Completeness

**Check each feature works:**
- [ ] Countries listing – paginated, cached
- [ ] States fetching – by country, complete
- [ ] Cities fetching – by state, paginated
- [ ] Search functionality – across all levels
- [ ] Validation endpoint – returns metadata
- [ ] Backward compatibility – manual search works
- [ ] Historical data – unaffected

#### 2.3 Log Analysis

**Review logs for:**
```bash
# Errors in last 2 hours
grep -i "error\|exception" app.log | tail -50

# Warnings
grep -i "warning\|deprecated" app.log | tail -20

# Database slow queries
# Check if any queries >5 seconds
```

**Expected:** Few to no errors, no warnings

#### 2.4 User-Facing Verification

```bash
# If users can access:
# 1. Manual search works (existing API)
curl http://localhost:5000/api/hybrid-measurements?city=Delhi

# 2. No increase in support tickets about API errors
# Check: Support email, Slack, issue tracker
# Should see: 0 new hierarchy-related issues
```

**Expected:** No new issues reported

### Window 2 Monitoring Checklist

Every 30 minutes:
- [ ] Database connectivity: ✅
- [ ] Response times normal: <200ms
- [ ] Error rate: <0.1%
- [ ] All tests passing: 29/29
- [ ] Cache functioning: ✅
- [ ] No data anomalies: ✅
- [ ] Logs clean: No critical errors
- [ ] Manual search working: ✅
- [ ] All features functional: ✅

---

## Window 3: Standard Monitoring (8-24 Hours Post-Migration)

### Monitoring Frequency
- **Check every 2 hours**
- **Active monitoring by:** Standard on-call rotation
- **Alert threshold:** > 1% error rate or response > 1000ms

### Simplified Metrics

| Metric | Expected | Check Every |
|--------|----------|------------|
| API errors | <1% | 2 hours |
| Response time | <300ms avg | 2 hours |
| Database connections | 10-20 | 4 hours |
| Cache hit rate | >80% | 4 hours |
| All tests passing | 29/29 | 4 hours |
| Manual search | Working | 4 hours |

### Window 3 Monitoring Checklist

Every 2 hours:
- [ ] Error rate: <1%
- [ ] Response times: <300ms avg
- [ ] Tests: 29/29 passing
- [ ] No new issues
- [ ] System stable

---

## Escalation Procedure

### Severity Levels & Escalation

#### CRITICAL 🔴 (Immediate Action)
**Conditions:**
- >5% error rate
- All tests failing (0/29)
- API not responding (500 errors)
- Database disconnected
- Data corruption detected
- Performance <1 req/sec

**Action:**
1. Notify on-call engineer immediately (phone call)
2. Alert technical lead
3. Page DBA if database issue
4. Prepare rollback (< 5 min)
5. Execute rollback if cannot fix in < 10 min
6. Post-mortem required

**Escalation:**
- Severity: P1
- Response time: < 2 minutes
- Decision: Rollback in < 10 min

#### HIGH 🟠 (Urgent Action)
**Conditions:**
- 1-5% error rate
- 3-5 tests failing
- Response time 500-1000ms
- Database slow (<1 query/sec)
- Intermittent failures

**Action:**
1. Notify on-call engineer
2. Alert technical lead
3. Investigate root cause
4. Fix if possible within 30 min
5. If not resolved, escalate to CRITICAL

**Escalation:**
- Severity: P2
- Response time: < 10 minutes
- Decision: Fix or escalate in 30 min

#### MEDIUM 🟡 (Monitor Closely)
**Conditions:**
- 0.1-1% error rate
- 1-2 tests failing
- Response time 200-500ms
- Occasional slow queries

**Action:**
1. Log incident
2. Investigate root cause
3. Fix if low-risk
4. Otherwise schedule for next maintenance
5. Continue close monitoring

**Escalation:**
- Severity: P3
- Response time: < 30 minutes
- Decision: Fix or defer in 1 hour

#### LOW 🟢 (Informational)
**Conditions:**
- <0.1% error rate
- All tests passing
- Response time normal
- No user impact

**Action:**
1. Continue standard monitoring
2. Log observations
3. Include in post-deployment summary

---

## Alert Escalation Tree

```
CRITICAL Alert
├─ 🔔 Slack #hierarchy-api-migration (immediate)
├─ ☎️ Call on-call engineer (immediate)
├─ 📧 Email technical lead (immediate)
├─ ⏱️ Prepare rollback (< 5 min)
└─ 🚨 Rollback if not fixed in 10 min

HIGH Alert
├─ 🔔 Slack #hierarchy-api-migration (immediate)
├─ 📧 Notify technical lead (< 5 min)
├─ 🔍 Investigate (< 15 min)
└─ ☎️ Call if needs escalation (10 min)

MEDIUM Alert
├─ 🔔 Slack #hierarchy-api-migration (within 30 min)
├─ 📝 Log incident
└─ 🔍 Investigate (< 1 hour)
```

---

## Alert Recipients

| Role | Name | Email | Phone | Slack |
|------|------|-------|-------|-------|
| On-Call Engineer | | | | @oncall |
| Technical Lead | | | | @tech-lead |
| DBA | | | | @dba |
| Operations Lead | | | | @ops |
| Project Manager | | | | @pm |

**To be filled in during Phase 5 of Pre-Migration Checklist**

---

## After 24 Hours: Transition to Standard Monitoring

### Success Criteria (All Must Be True)
- ✅ Zero critical errors
- ✅ <0.1% error rate sustained
- ✅ Response times normal (<300ms avg)
- ✅ All tests passing consistently
- ✅ No data corruption
- ✅ Manual search unaffected
- ✅ No user complaints
- ✅ Cache functioning
- ✅ Database performance normal
- ✅ No security issues

### If Success Criteria Met
1. [ ] Update status: "Production Migration - SUCCESS"
2. [ ] Post summary to #hierarchy-api-migration
3. [ ] Schedule frontend integration activation (next step)
4. [ ] Archive monitoring logs
5. [ ] Schedule post-mortem (optional, if any issues found)

### If Success Criteria NOT Met
1. [ ] Extend monitoring window
2. [ ] Continue investigating issues
3. [ ] Escalate if new critical issues
4. [ ] Plan remediation
5. [ ] Consider rollback if issues unresolved after 48 hours

---

## Monitoring Tools

### Command Line Monitoring

```bash
# Real-time API monitoring
watch -n 15 'curl -s http://localhost:5000/api/hierarchy/countries | jq ".length"'

# Log watching
tail -f app.log | grep -i "error\|exception\|warning"

# Database connections
watch -n 30 'psql ... -c "SELECT count(*) FROM pg_stat_activity;"'
```

### Dashboard URLs (To be configured)

- **Application Monitoring:** ___________________
- **Database Monitoring:** ___________________
- **Log Aggregation:** ___________________
- **Metrics:** ___________________

---

## Post-Monitoring Summary (After 24 Hours)

**Prepared by:** ___________________  
**Date/Time:** ___________________  
**Duration:** 24 hours

### Summary Statistics
- Total checks performed: ___________________
- Alerts triggered: ___________________
- Critical alerts: ___________________
- Issues resolved: ___________________
- Performance degradation observed: None / [list]

### Key Findings
```
1. ___________________
2. ___________________
3. ___________________
```

### Recommendations for Frontend Activation
- ✅ **Approved** – Production stable, ready for frontend integration
- ⏳ **Conditional** – [list conditions to meet before frontend activation]
- ❌ **Not Approved** – [list reasons and remediation plan]

### Sign-Off
- [ ] On-Call Engineer: ___________________
- [ ] Technical Lead: ___________________
- [ ] Project Manager: ___________________

---

**Monitoring Plan Status:** Ready to Deploy  
**Next Step:** After 24-hour monitoring completes, proceed to frontend integration (if approved)
