Hybrid Search & Hierarchy Validation Checklist

1. Backend availability
- [ ] Start server: `npm run dev` or `node server/index.js`
- [ ] Ensure `/api/hybrid-measurements` responds (POST)

2. End-to-end scenarios
- [ ] Manual free-text search: `Delhi`, `New Delhi`, `Delh`
- [ ] Fuzzy partial input: `Bengaluru` -> `Bengaluru, Karnataka, India`
- [ ] Country-only search: `India`
- [ ] Country + state override: `country=India, state=Karnataka`
- [ ] Hierarchy selection: choose country->state->city in UI, then `Show Data`
- [ ] Autocomplete scoping: After selecting a country, suggestions should prioritize that country

3. Provider enrichment
- [ ] Response contains `resolvedLocation` or `location` fields populated from providers
- [ ] `source` field shows which provider(s) were used (OpenAQ, WAQI, OpenWeather)
- [ ] Fallback generation occurs only when provider data absent

4. Sanitizer effects
- [ ] Run `node server/sanitize_hierarchy_for_staging.js` in dry-run and inspect diagnostics
- [ ] Confirm legitimate states are not collapsed to `General Region` unexpectedly
- [ ] Confirm station-label heuristic does not remove common city names containing commas/dashes

5. Coverage
- [ ] Verify OpenAQ coverage improved after pagination (check `/api/locations/summary`)

6. Reporting
- [ ] Generate hierarchy quality report: `node server/generate_hierarchy_quality_report.js --sanitized=server/aqi_coverage_map_sanitized_2026-05-11.json`

7. Follow-ups
- [ ] If issues found, collect examples and add to `server/sanitize_hierarchy_for_staging.js` diagnostics
- [ ] Iterate sanitizer rules and re-run staging orchestrator
