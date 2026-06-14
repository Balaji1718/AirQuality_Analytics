#!/usr/bin/env node

/**
 * Staging Hierarchy Cleanup Orchestrator
 * 
 * Coordinates the complete sanitization and quality reporting workflow.
 * Safe, read-only by default. Staging rebuild requires explicit confirmation.
 * 
 * Usage:
 *   node staging_hierarchy_orchestrator.js              (report only)
 *   node staging_hierarchy_orchestrator.js --rebuild    (with staging rebuild)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function log(msg) {
  console.log(msg);
}

function logHeader(title) {
  log(`\n${'='.repeat(70)}`);
  log(`  ${title}`);
  log(`${'='.repeat(70)}\n`);
}

function logStep(num, title) {
  log(`\n${'─'.repeat(70)}`);
  log(`  STEP ${num}: ${title}`);
  log(`${'─'.repeat(70)}\n`);
}

function runCommand(cmd, description) {
  log(`▶️  ${description}...`);
  try {
    const output = execSync(cmd, { encoding: 'utf8', cwd: path.join(__dirname) });
    return { success: true, output };
  } catch (err) {
    log(`❌ ${description} failed`);
    log(err.message);
    return { success: false, output: err.message };
  }
}

async function main() {
  const shouldRebuild = process.argv.includes('--rebuild');

  logHeader('🧹 STAGING HIERARCHY CLEANUP ORCHESTRATOR');

  log('This workflow:');
  log('  1. Sanitizes production artifact for staging');
  log('  2. Generates before/after quality report');
  log('  3. (Optional) Rebuilds staging hierarchy tables\n');

  log('📋 Mode: ' + (shouldRebuild ? '🔄 WITH STAGING REBUILD' : '📊 REPORT ONLY (dry-run)'));
  log('   Production data remains unchanged\n');

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1: Validate environment
  // ─────────────────────────────────────────────────────────────────────────
  logStep(1, 'Validate Environment');

  const inputPath = path.join(__dirname, 'aqi_coverage_map.json');
  if (!fs.existsSync(inputPath)) {
    log(`❌ Input artifact not found: ${inputPath}`);
    process.exit(1);
  }
  log(`✅ Production artifact found (${fs.statSync(inputPath).size} bytes)\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2: Run sanitization
  // ─────────────────────────────────────────────────────────────────────────
  logStep(2, 'Generate Sanitized Artifact');

  const sanitizeResult = runCommand(
    `node sanitize_hierarchy_for_staging.js`,
    'Sanitizing hierarchy'
  );

  if (!sanitizeResult.success) {
    log('❌ Sanitization failed');
    process.exit(1);
  }

  // Extract sanitized file path from output
  const sanitizedMatch = sanitizeResult.output.match(/📁 Sanitized artifact: (.+)/);
  const sanitizedPath = sanitizedMatch ? sanitizedMatch[1].trim() : null;

  if (!sanitizedPath || !fs.existsSync(sanitizedPath)) {
    log('❌ Sanitized artifact not generated');
    process.exit(1);
  }

  log(sanitizeResult.output);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3: Generate quality report
  // ─────────────────────────────────────────────────────────────────────────
  logStep(3, 'Generate Quality Report');

  const reportResult = runCommand(
    `node generate_hierarchy_quality_report.js --sanitized="${sanitizedPath}"`,
    'Generating before/after report'
  );

  if (!reportResult.success) {
    log('⚠️  Report generation encountered an issue:');
    log(reportResult.output);
  } else {
    log(reportResult.output);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4: Staging rebuild (if --rebuild)
  // ─────────────────────────────────────────────────────────────────────────
  if (shouldRebuild) {
    logStep(4, 'Rebuild Staging Hierarchy');

    log('⚠️  This will:');
    log('    - Truncate staging hierarchy tables');
    log('    - Repopulate from sanitized artifact');
    log('    - Regenerate hierarchy cache\n');

    log('Executing rebuild with explicit target confirmation...\n');

    const rebuildResult = runCommand(
      `node rebuild_staging_hierarchy_from_sanitized.js --apply --target=staging --artifact="${sanitizedPath}"`,
      'Rebuilding staging hierarchy'
    );

    if (!rebuildResult.success) {
      log('❌ Staging rebuild failed');
      log(rebuildResult.output);
      process.exit(1);
    }

    log(rebuildResult.output);
  } else {
    logStep(4, 'Staging Rebuild (Skipped)');
    log('Use --rebuild flag to execute staging database update\n');
    log('Command: node staging_hierarchy_orchestrator.js --rebuild\n');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────
  logHeader('✅ WORKFLOW COMPLETE');

  log('📁 Generated artifacts:');
  log(`   - Sanitized data: ${sanitizedPath}`);
  if (reportResult.success) {
    const reportMatch = reportResult.output.match(/Report generated: (.+)/);
    if (reportMatch) {
      log(`   - Quality report: ${reportMatch[1].trim()}`);
    }
  }

  log('\n📋 Next steps:');
  if (!shouldRebuild) {
    log('   1. Review the quality report');
    log('   2. Verify sanitized artifact contents');
    log('   3. Run with --rebuild to update staging database\n');
    log('   Command: node staging_hierarchy_orchestrator.js --rebuild\n');
  } else {
    log('   1. Run endpoint tests: node verify_hierarchy_endpoints.js');
    log('   2. Test frontend dropdowns against staging API');
    log('   3. Verify manual search still works as fallback');
    log('   4. Review quality report for changes');
    log('   5. Plan production rollout if staging validation passes\n');
  }

  log('🔒 Production database: UNCHANGED\n');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
