# Hierarchical Migration Runbook

This runbook keeps the hierarchical AQI migration manual-only until staging is verified.

## Order Of Operations

1. Review `migration_hierarchical_locations.sql` and `hierarchical_schema_design.js`.
2. Create a Neon backup or branch before execution.
3. Test on a local database or Neon staging branch first.
4. Run the manual migration script only with an explicit target:
   - `node server/apply_hierarchy_migration_and_populate.js --apply --target=local`
   - `node server/apply_hierarchy_migration_and_populate.js --apply --target=staging`
5. Verify application APIs, charts, analytics, dropdown search, and deployment stability.
6. Promote to production only after staging results are clean.

## Safety Rules

- Do not attach migration execution to Render startup or build commands.
- Keep migration execution manual only.
- Treat production Neon as read-only until the staging checklist passes.
- If population fails, the script rolls back the transaction before exiting.

## Recommended Backup Step

- Create a Neon branch or snapshot before any execution.
- Use that branch for the first validation pass and keep production untouched until the migration is fully verified.

## Verification Checklist

- Existing AQI APIs still return the same or better results.
- Historical charts still load and plot data correctly.
- Analytics pages still compute summaries without regression.
- Pollutant tables render and sort as expected.
- Dropdown search still resolves country, state, and city queries.
- Render deployment starts and restarts without additional migration work.
- Existing endpoints do not slow down measurably after the schema changes.
- Rollback path works when a population error is injected in staging.

## Production-Safe Rollout Plan

1. Re-run the migration on a fresh Neon branch copy.
2. Compare row counts, indexes, and view output against staging.
3. Freeze any unrelated backend changes during the rollout window.
4. Apply the migration manually in production only after sign-off.
5. Re-run the verification checklist immediately after production promotion.
