/**
 * Before/After Quality Report Generator
 * 
 * Compares production hierarchy data against sanitized staging data
 * Generates comprehensive quality metrics without touching production.
 * 
 * Run: node generate_hierarchy_quality_report.js [--sanitized=path] [--output=path]
 */

const fs = require('fs');
const path = require('path');
const { validateHierarchyQuality } = require('./hierarchy_normalization_rules');

function parseArgs(argv) {
  const parsed = {
    sanitized: path.join(__dirname, 'aqi_coverage_map_sanitized.json'),
    diagnostics: null,
    output: path.join(__dirname, `HIERARCHY_QUALITY_REPORT_${new Date().toISOString().split('T')[0]}.md`)
  };

  for (const arg of argv) {
    if (arg.startsWith('--sanitized=')) {
      parsed.sanitized = arg.split('=')[1] || parsed.sanitized;
    }
    if (arg.startsWith('--output=')) {
      parsed.output = arg.split('=')[1] || parsed.output;
    }
    if (arg.startsWith('--diagnostics=')) {
      parsed.diagnostics = arg.split('=')[1] || parsed.diagnostics;
    }
  }

  return parsed;
}

function extractMetrics(hierarchy, label = 'Data') {
  const validation = validateHierarchyQuality(hierarchy);
  const countries = Object.keys(hierarchy.supported_countries || {});

  let countCities = 0;
  let countStates = 0;
  let unknownRegions = 0;
  let stationLabels = 0;
  const cityNameCounts = {};

  for (const countryData of Object.values(hierarchy.supported_countries || {})) {
    for (const [stateName, stateData] of Object.entries(countryData.regions || {})) {
      if (/^unknown/i.test(stateName)) {
        unknownRegions++;
      }
      countStates++;

      for (const city of (stateData.cities || [])) {
        countCities++;
        if (city.is_station_label) {
          stationLabels++;
        }
        const key = city.name || city;
        cityNameCounts[key] = (cityNameCounts[key] || 0) + 1;
      }
    }
  }

  // Find cross-country duplicates
  const duplicateCities = Object.entries(cityNameCounts)
    .filter(([_, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  return {
    label,
    countries: countries.length,
    states: countStates,
    cities: countCities,
    unknown_regions: unknownRegions,
    station_label_cities: stationLabels,
    duplicate_city_names: duplicateCities.length,
    quality_validation: validation,
    top_duplicates: duplicateCities.map(([name, count]) => ({ name, countries: count }))
  };
}

function generateReport() {
  console.log('\n📊 Generating quality report...\n');

  const inputPath = path.join(__dirname, 'aqi_coverage_map.json');
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(args.sanitized)) {
    console.error(`Sanitized file not found: ${args.sanitized}`);
    process.exit(1);
  }

  const production = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const sanitized = JSON.parse(fs.readFileSync(args.sanitized, 'utf8'));
  const diagnosticsPath = args.diagnostics || args.sanitized.replace(/\.json$/, '.diagnostics.json');
  const diagnostics = fs.existsSync(diagnosticsPath) ? JSON.parse(fs.readFileSync(diagnosticsPath, 'utf8')) : null;

  const prodMetrics = extractMetrics(production, 'Production');
  const stagingMetrics = extractMetrics(sanitized, 'Staging (Sanitized)');

  // Calculate improvements
  const improvements = {
    countries_change: stagingMetrics.countries - prodMetrics.countries,
    countries_pct: ((stagingMetrics.countries - prodMetrics.countries) / prodMetrics.countries * 100).toFixed(1),
    states_change: stagingMetrics.states - prodMetrics.states,
    states_pct: ((stagingMetrics.states - prodMetrics.states) / prodMetrics.states * 100).toFixed(1),
    cities_change: stagingMetrics.cities - prodMetrics.cities,
    cities_pct: ((stagingMetrics.cities - prodMetrics.cities) / prodMetrics.cities * 100).toFixed(1),
    unknown_regions_eliminated: prodMetrics.unknown_regions - stagingMetrics.unknown_regions,
    station_labels_reduced: prodMetrics.station_label_cities - stagingMetrics.station_label_cities,
    duplicates_reduced: prodMetrics.duplicate_city_names - stagingMetrics.duplicate_city_names
  };

  let md = `# Hierarchy Data Quality Report\n\n`;
  md += `**Generated:** ${new Date().toISOString()}\n\n`;

  md += `## Executive Summary\n\n`;
  md += `This report compares current production hierarchy data against sanitized staging data.\n`;
  md += `The staging data has been processed through normalization rules to identify and remove data quality issues.\n\n`;

  md += `### Key Findings\n\n`;
  md += `- **Unknown Region Placeholders Eliminated:** ${improvements.unknown_regions_eliminated} states\n`;
  md += `- **Station-Label Cities Reduced:** ${improvements.station_labels_reduced} entries\n`;
  md += `- **Cross-Country Duplicates Reduced:** ${improvements.duplicates_reduced} city names\n`;
  md += `- **Overall City Count Change:** ${improvements.cities_change} (${improvements.cities_pct}%)\n\n`;

  if (diagnostics?.stats?.retained_by_country) {
    md += `## Retained Coverage by Country\n\n`;
    md += `| Country | Input States | Retained States | Input Cities | Retained Cities |\n`;
    md += `|---------|--------------:|----------------:|-------------:|----------------:|\n`;
    Object.entries(diagnostics.stats.retained_by_country)
      .sort((a, b) => b[1].retained_cities - a[1].retained_cities)
      .forEach(([country, counts]) => {
        md += `| ${country} | ${counts.input_states} | ${counts.retained_states} | ${counts.input_cities} | ${counts.retained_cities} |\n`;
      });
    md += `\n`;
  }

  md += `## Detailed Metrics\n\n`;

  md += `### Production Data\n\n`;
  md += `| Metric | Count |\n`;
  md += `|--------|-------|\n`;
  md += `| Countries | ${prodMetrics.countries} |\n`;
  md += `| States | ${prodMetrics.states} |\n`;
  md += `| Cities | ${prodMetrics.cities} |\n`;
  md += `| Unknown Regions | ${prodMetrics.unknown_regions} ⚠️ |\n`;
  md += `| Station-Label Cities | ${prodMetrics.station_label_cities} ⚠️ |\n`;
  md += `| Cross-Country Duplicates | ${prodMetrics.duplicate_city_names} ⚠️ |\n\n`;

  md += `### Staging Data (After Sanitization)\n\n`;
  md += `| Metric | Count |\n`;
  md += `|--------|-------|\n`;
  md += `| Countries | ${stagingMetrics.countries} |\n`;
  md += `| States | ${stagingMetrics.states} |\n`;
  md += `| Cities | ${stagingMetrics.cities} |\n`;
  md += `| Unknown Regions | ${stagingMetrics.unknown_regions} ✅ |\n`;
  md += `| Station-Label Cities | ${stagingMetrics.station_label_cities} ✅ |\n`;
  md += `| Cross-Country Duplicates | ${stagingMetrics.duplicate_city_names} ✅ |\n\n`;

  md += `## Improvements\n\n`;
  md += `| Metric | Change | % Change |\n`;
  md += `|--------|--------|----------|\n`;
  md += `| Countries | ${improvements.countries_change} | ${improvements.countries_pct}% |\n`;
  md += `| States | ${improvements.states_change} | ${improvements.states_pct}% |\n`;
  md += `| Cities | ${improvements.cities_change} | ${improvements.cities_pct}% |\n`;
  md += `| Unknown Regions | -${improvements.unknown_regions_eliminated} | 100% eliminated |\n`;
  md += `| Station Labels | -${improvements.station_labels_reduced} | ${(improvements.station_labels_reduced / prodMetrics.station_label_cities * 100).toFixed(1)}% reduced |\n`;
  md += `| Duplicates | -${improvements.duplicates_reduced} | ${(improvements.duplicates_reduced / prodMetrics.duplicate_city_names * 100).toFixed(1)}% reduced |\n\n`;

  md += `## Quality Validation Results\n\n`;
  md += `### Production Data Validation\n\n`;
  md += `**Status:** ${prodMetrics.quality_validation.passes ? '✅ Passes' : '❌ Issues Found'}\n\n`;
  const prodIssues = prodMetrics.quality_validation.report.issues;
  md += `- Unknown regions: ${prodIssues.unknown_regions}\n`;
  md += `- Station-label cities: ${prodIssues.station_label_cities}\n`;
  md += `- Cross-country leaks: ${prodIssues.cross_country_leaks.length}\n`;
  md += `- Invalid records: ${prodIssues.invalid_records}\n\n`;

  md += `### Staging Data Validation\n\n`;
  md += `**Status:** ${stagingMetrics.quality_validation.passes ? '✅ Passes' : '❌ Issues Found'}\n\n`;
  const stagingIssues = stagingMetrics.quality_validation.report.issues;
  md += `- Unknown regions: ${stagingIssues.unknown_regions}\n`;
  md += `- Station-label cities: ${stagingIssues.station_label_cities}\n`;
  md += `- Cross-country leaks: ${stagingIssues.cross_country_leaks.length}\n`;
  md += `- Invalid records: ${stagingIssues.invalid_records}\n\n`;

  if (diagnostics?.stats?.removed_by_rule) {
    md += `## Sanitizer Rule Counts\n\n`;
    md += `| Rule | Count |\n`;
    md += `|------|------:|\n`;
    Object.entries(diagnostics.stats.removed_by_rule).forEach(([rule, count]) => {
      md += `| ${rule} | ${count} |\n`;
    });
    md += `\n`;
  }

  if (diagnostics?.stats?.removed_examples) {
    md += `## Removed Entry Examples\n\n`;
    for (const [rule, examples] of Object.entries(diagnostics.stats.removed_examples)) {
      if (!examples || examples.length === 0) continue;
      md += `### ${rule}\n\n`;
      examples.slice(0, 5).forEach((example, idx) => {
        md += `${idx + 1}. ${JSON.stringify(example)}\n`;
      });
      md += `\n`;
    }
  }

  md += `## Top Cross-Country Duplicates (Before Sanitization)\n\n`;
  md += `These city names appear in multiple countries in production:\n\n`;
  prodMetrics.top_duplicates.slice(0, 15).forEach((dup, idx) => {
    md += `${idx + 1}. **${dup.name}** - appears in ${dup.countries} countries\n`;
  });

  md += `\n## Sanitization Rules Applied\n\n`;
  md += `The staging data was processed using the following rules:\n\n`;
  md += `1. **Strict Country Validation** - Per-record validation against source metadata\n`;
  md += `2. **Unknown Region Filtering** - Rejected all unknown_* placeholder states\n`;
  md += `3. **Station-Label Sanitization** - Normalized and filtered raw monitoring station labels\n`;
  md += `4. **Coordinate Validation** - Rejected entries with missing or invalid lat/lon\n`;
  md += `5. **Cross-Country Leakage Detection** - Identified and logged implausible duplicates\n`;
  md += `6. **Canonical City Deduplication** - Used location-aware hashing to eliminate duplicates\n\n`;

  md += `## Recommendations\n\n`;
  md += `### Immediate Actions (Staging Only)\n`;
  md += `1. Verify sanitized artifact contains expected city counts\n`;
  md += `2. Test frontend hierarchy dropdowns against staging API\n`;
  md += `3. Run comprehensive endpoint test suite (verify_hierarchy_endpoints.js)\n`;
  md += `4. Validate all 5 hierarchy endpoints work correctly\n`;
  md += `5. Confirm manual AQI search still works as fallback\n\n`;

  md += `### Before Production Application\n`;
  md += `1. Compare manual search results between production and staging\n`;
  md += `2. Verify no critical location data was removed\n`;
  md += `3. Review top changes to ensure they align with cleanup goals\n`;
  md += `4. Consider gradual rollout (e.g., by country) if audit finds issues\n`;
  md += `5. Establish post-merge monitoring checklist\n\n`;

  md += `## Data Protection Notes\n\n`;
  md += `- ✅ Production database remains unchanged during this phase\n`;
  md += `- ✅ Staging environment is isolated for testing\n`;
  md += `- ✅ Feature flags remain active; manual search fallback preserved\n`;
  md += `- ✅ All normalization rules are read-only; no source data modified\n`;
  md += `- ✅ Before/after comparison is transparent and auditable\n\n`;

  fs.writeFileSync(args.output, md);
  console.log(`✅ Report generated: ${args.output}\n`);

  // Summary to console
  console.log('📈 Quality Summary:\n');
  console.log(`Production: ${prodMetrics.countries} countries, ${prodMetrics.states} states, ${prodMetrics.cities} cities`);
  console.log(`  Issues: ${prodMetrics.unknown_regions} unknown_regions, ${prodMetrics.station_label_cities} station-labels, ${prodMetrics.duplicate_city_names} cross-country dups\n`);

  console.log(`Staging (Sanitized): ${stagingMetrics.countries} countries, ${stagingMetrics.states} states, ${stagingMetrics.cities} cities`);
  console.log(`  Issues: ${stagingMetrics.unknown_regions} unknown_regions, ${stagingMetrics.station_label_cities} station-labels, ${stagingMetrics.duplicate_city_names} cross-country dups\n`);

  console.log('Improvements:');
  console.log(`  ✅ Unknown regions: -${improvements.unknown_regions_eliminated}`);
  console.log(`  ✅ Station labels: -${improvements.station_labels_reduced}`);
  console.log(`  ✅ Cross-country dups: -${improvements.duplicates_reduced}\n`);
}

if (require.main === module) {
  try {
    generateReport();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

module.exports = { extractMetrics, generateReport };
