# Production Post-Deploy Monitoring Checklist (First 24h)

Quick, actionable checklist to run after promoting the hierarchy-enabled release to production.

Window 0–2h (every 15 min)
- [ ] DB connection: `curl -I http://localhost:5000/api/hierarchy/countries` → 200 OK
- [ ] Countries endpoint latency: <200ms (alert if >500ms)
- [ ] Search endpoint latency: <300ms (alert if >600ms)
- [ ] Existing manual search (`/api/hybrid-measurements`) returns 200 and normal payload
- [ ] Error rate (5xx) in logs: 0 (alert if >2 in 15m)
- [ ] Run quick verification: `node server/verify_hierarchy_endpoints.js` → 29/29 pass
- [ ] Data integrity spot-checks (psql):
  - `SELECT COUNT(*) FROM aqi_countries;` (expect 37)
  - `SELECT COUNT(*) FROM aqi_hierarchy_cache;` (expect 37)
  - `SELECT COUNT(*) FROM aqi_countries WHERE country_name ~ '^\\d+$';` (expect 0)
- [ ] Cache behavior: second `/api/hierarchy/countries` call is noticeably faster (cache hit)

Window 2–8h (every 30 min)
- [ ] Monitor API error trends and logs; escalate if any persistent 5xx
- [ ] Check DB connections and long-running queries (>5s)
- [ ] Re-run subsets of verification tests failing intermittently

Window 8–24h (every 2 hours)
- [ ] Confirm sustained low error rate and normal latencies
- [ ] Review analytics/telemetry for abnormal usage patterns

Escalation & rollback
- [ ] If critical errors or multiple verification failures: route traffic to previous version or follow `server/staging_rollback.js` procedure
- [ ] Preserve logs and DB snapshots before rollback

Notes
- Manual search is permanent fallback; do not disable it during monitoring.
- If you need a fast health snapshot, run `node server/prod_preflight_checks.js`.
