#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function safeReadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return readJson(filePath);
}

function normalizeProvider(source) {
  const s = String(source || '').toLowerCase();
  if (s.includes('openweather')) return 'OpenWeather';
  if (s.includes('waqi')) return 'WAQI';
  if (s.includes('openaq')) return 'OpenAQ';
  return source || 'unknown';
}

function getLatestFile(dir, matcher) {
  const files = fs.readdirSync(dir).filter(matcher);
  if (files.length === 0) return null;
  files.sort((a, b) => {
    const aTime = fs.statSync(path.join(dir, a)).mtimeMs;
    const bTime = fs.statSync(path.join(dir, b)).mtimeMs;
    return bTime - aTime;
  });
  return path.join(dir, files[0]);
}

function toSet(arr) {
  return new Set((arr || []).filter(Boolean));
}

function countWhere(arr, pred) {
  return arr.reduce((sum, x) => sum + (pred(x) ? 1 : 0), 0);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function analyze() {
  const serverDir = __dirname;

  const countries193 = readJson(path.join(serverDir, 'countries_193.json'));
  const coverageMap = safeReadJson(path.join(serverDir, 'coverage_map.json')) || {};
  const regionalCoverage = safeReadJson(path.join(serverDir, 'regional_coverage.json')) || {};
  const rawHierarchy = safeReadJson(path.join(serverDir, 'aqi_coverage_map.json')) || { supported_countries: {} };

  const latestSanitizedPath = getLatestFile(
    serverDir,
    name => /^aqi_coverage_map_sanitized_\d{4}-\d{2}-\d{2}\.json$/.test(name)
  );
  const latestDiagnosticsPath = getLatestFile(
    serverDir,
    name => /^aqi_coverage_map_sanitized_\d{4}-\d{2}-\d{2}\.diagnostics\.json$/.test(name)
  );

  const sanitizedHierarchy = latestSanitizedPath ? readJson(latestSanitizedPath) : { supported_countries: {} };
  const diagnostics = latestDiagnosticsPath ? readJson(latestDiagnosticsPath) : null;

  const countryList = countries193.countries || [];
  const regionalCountries = Object.entries(regionalCoverage).map(([name, data]) => ({ name, data }));

  const rawStateNamesByCountry = {};
  for (const [countryName, countryData] of Object.entries(rawHierarchy.supported_countries || {})) {
    rawStateNamesByCountry[countryName] = new Set(Object.keys(countryData.regions || {}));
  }

  const providerCountryContribution = {
    OpenWeather: 0,
    WAQI: 0,
    OpenAQ: 0,
  };

  let totalRegionalNodes = 0;
  let totalRegionalCitiesFromFederation = 0;
  let trueAdministrativeRegions = 0;
  let pseudoRegions = 0;
  let capitalOnlyFallbackRegions = 0;
  let syntheticHierarchyNodes = 0;
  let providerEnrichedNodes = 0;
  let providerOverlapNodes = 0;
  let fallbackActivationNodes = 0;

  const countriesWithStrongDepth = [];
  const countriesWithWeakDepth = [];
  const fallbackOnlyCountries = [];
  const openWeatherOnlyFallbackCountries = [];
  const waqiEnrichedCountries = [];
  const openaqInactiveCountries = [];

  const perCountryFederation = [];

  for (const { name: countryName, data } of regionalCountries) {
    const regionsObj = data.regions || {};
    const regionNames = Object.keys(regionsObj);
    const detailedRegions = Number(data.total_regions || 0);
    const fallbackOnly = detailedRegions === 0;

    const providersInCountry = new Set();
    const rawStateNames = rawStateNamesByCountry[countryName] || new Set();

    let countryNodeOverlap = 0;
    let countryFallbackNodes = 0;
    let countryTrueAdmin = 0;
    let countrySynthetic = 0;

    for (const regionName of regionNames) {
      const r = regionsObj[regionName] || {};
      const apis = r.apis || {};
      const availableProviders = [];

      totalRegionalNodes += 1;
      totalRegionalCitiesFromFederation += 1; // federation map models each region as one city-level node

      for (const [providerRaw, status] of Object.entries(apis)) {
        const provider = normalizeProvider(providerRaw);
        if (status === 'available' || status === true) {
          availableProviders.push(provider);
          providersInCountry.add(provider);
        }
        if (status === 'fallback') {
          fallbackActivationNodes += 1;
          countryFallbackNodes += 1;
        }
      }

      const uniqueAvailable = [...new Set(availableProviders)];
      if (uniqueAvailable.length > 1) {
        providerOverlapNodes += 1;
        providerEnrichedNodes += 1;
        countryNodeOverlap += 1;
      }

      const isCapitalFallback = regionName === 'Capital/Center' || r.fallback_method === 'country_center_coordinates';
      const isSynthetic = isCapitalFallback || regionName === 'General Region';

      if (isCapitalFallback) {
        capitalOnlyFallbackRegions += 1;
      }
      if (isSynthetic) {
        syntheticHierarchyNodes += 1;
        countrySynthetic += 1;
      }

      if (rawStateNames.has(regionName) && !/^unknown/i.test(regionName)) {
        trueAdministrativeRegions += 1;
        countryTrueAdmin += 1;
      } else if (!isSynthetic) {
        pseudoRegions += 1;
      }
    }

    for (const provider of providersInCountry) {
      if (providerCountryContribution[provider] !== undefined) {
        providerCountryContribution[provider] += 1;
      }
    }

    const hasWAQI = providersInCountry.has('WAQI');
    const hasOpenAQ = providersInCountry.has('OpenAQ');
    const hasOpenWeather = providersInCountry.has('OpenWeather');

    if (hasWAQI) waqiEnrichedCountries.push(countryName);
    if (!hasOpenAQ) openaqInactiveCountries.push(countryName);

    if (fallbackOnly) {
      fallbackOnlyCountries.push(countryName);
      if (hasOpenWeather && !hasWAQI && !hasOpenAQ) {
        openWeatherOnlyFallbackCountries.push(countryName);
      }
    }

    const depthType = fallbackOnly
      ? 'fallback_only'
      : detailedRegions >= 5 && countryNodeOverlap > 0
        ? 'strong'
        : detailedRegions <= 1
          ? 'weak'
          : 'moderate';

    if (depthType === 'strong') countriesWithStrongDepth.push(countryName);
    if (depthType === 'weak' || fallbackOnly) countriesWithWeakDepth.push(countryName);

    perCountryFederation.push({
      country: countryName,
      detailed_regions: detailedRegions,
      fallback_only: fallbackOnly,
      providers: [...providersInCountry].sort(),
      provider_overlap_nodes: countryNodeOverlap,
      fallback_nodes: countryFallbackNodes,
      true_admin_regions: countryTrueAdmin,
      synthetic_nodes: countrySynthetic,
      hierarchy_depth_class: depthType,
    });
  }

  const sanitizedCountries = Object.entries(sanitizedHierarchy.supported_countries || {});
  let sanitizedStates = 0;
  let sanitizedCities = 0;
  let sanitizedAdministrativeRegions = 0;
  let sanitizedProviderLocalityRegions = 0;
  let sanitizedSyntheticRegions = 0;
  let regionEqualsCityPatterns = 0;
  let duplicatedHierarchyLayers = 0;
  let providerOverlapSanitizedNodes = 0;

  const sanitizedProviderCountryContribution = {
    OpenWeather: 0,
    WAQI: 0,
    OpenAQ: 0,
    unknown: 0,
  };

  const sanitizedCountryDepth = [];

  for (const [countryName, countryData] of sanitizedCountries) {
    const countryProviders = new Set();
    let statesInCountry = 0;
    let citiesInCountry = 0;

    for (const [stateName, stateData] of Object.entries(countryData.regions || {})) {
      statesInCountry += 1;
      sanitizedStates += 1;

      const regionType = String(stateData.region_type || '').toLowerCase();
      if (regionType === 'administrative') {
        sanitizedAdministrativeRegions += 1;
      } else if (regionType === 'provider_locality') {
        sanitizedProviderLocalityRegions += 1;
      } else if (stateData.synthetic === true || regionType.includes('synthetic')) {
        sanitizedSyntheticRegions += 1;
      }

      const cityNames = new Set();
      for (const city of stateData.cities || []) {
        sanitizedCities += 1;
        citiesInCountry += 1;

        const provider = normalizeProvider(city.source);
        if (!sanitizedProviderCountryContribution[provider]) sanitizedProviderCountryContribution[provider] = 0;
        countryProviders.add(provider);

        const cityName = String(city.name || '').trim();
        cityNames.add(cityName.toLowerCase());
        if (cityName && cityName.toLowerCase() === String(stateName).toLowerCase()) {
          regionEqualsCityPatterns += 1;
        }
      }

      if ((stateData.cities || []).length === 1 && cityNames.has(String(stateName).toLowerCase())) {
        duplicatedHierarchyLayers += 1;
      }
    }

    if (countryProviders.size > 1) {
      providerOverlapSanitizedNodes += 1;
    }

    for (const p of countryProviders) {
      if (!sanitizedProviderCountryContribution[p]) sanitizedProviderCountryContribution[p] = 0;
      sanitizedProviderCountryContribution[p] += 1;
    }

    sanitizedCountryDepth.push({
      country: countryName,
      states: statesInCountry,
      cities: citiesInCountry,
      providers: [...countryProviders].sort(),
    });
  }

  const countriesWithMultiState = countWhere(sanitizedCountryDepth, c => c.states > 1);
  const statesWithMultiCity = sanitizedStates === 0 ? 0 : countWhere(
    sanitizedCountries.flatMap(([countryName, countryData]) => Object.entries(countryData.regions || {}).map(([stateName, stateData]) => ({ countryName, stateName, cityCount: (stateData.cities || []).length }))),
    s => s.cityCount > 1
  );

  const totalCountriesEffective = sanitizedCountries.length;

  const completenessScore = totalCountriesEffective === 0 || sanitizedStates === 0
    ? 0
    : round2(
      ((totalCountriesEffective / Math.max(1, diagnostics?.stats?.input_countries || totalCountriesEffective)) * 0.4 +
      (countriesWithMultiState / totalCountriesEffective) * 0.25 +
      (statesWithMultiCity / sanitizedStates) * 0.35) * 100
    );

  const authenticityScore = totalRegionalNodes === 0
    ? 0
    : round2(((trueAdministrativeRegions / totalRegionalNodes) * 0.6 + ((totalRegionalNodes - syntheticHierarchyNodes) / totalRegionalNodes) * 0.4) * 100);

  const cleanupCounts = diagnostics?.stats?.removed_by_rule || {};
  const restorationSuccessRate = diagnostics?.stats?.input_countries
    ? round2((diagnostics.stats.output_countries / diagnostics.stats.input_countries) * 100)
    : null;

  const providerDependencyRatios = {
    openweather_dependency_ratio: round2((providerCountryContribution.OpenWeather / Math.max(1, regionalCountries.length)) * 100),
    waqi_dependency_ratio: round2((providerCountryContribution.WAQI / Math.max(1, regionalCountries.length)) * 100),
    openaq_dependency_ratio: round2((providerCountryContribution.OpenAQ / Math.max(1, regionalCountries.length)) * 100),
  };

  const metrics = {
    total_countries_federation: regionalCountries.length,
    total_countries_effective_cleaned: totalCountriesEffective,
    total_states_effective_cleaned: sanitizedStates,
    total_cleaned_administrative_regions: sanitizedAdministrativeRegions,
    total_cleaned_provider_locality_regions: sanitizedProviderLocalityRegions,
    total_cleaned_synthetic_regions: sanitizedSyntheticRegions,
    total_real_administrative_regions: trueAdministrativeRegions,
    total_synthetic_regions: syntheticHierarchyNodes,
    total_pseudo_regions: pseudoRegions,
    total_capital_fallback_regions: capitalOnlyFallbackRegions,
    total_cities_effective_cleaned: sanitizedCities,
    provider_coverage_overlap_nodes: providerOverlapNodes,
    fallback_activation_frequency_nodes: fallbackActivationNodes,
    provider_dependency_ratios: providerDependencyRatios,
    hierarchy_completeness_score: completenessScore,
    hierarchy_authenticity_score: authenticityScore,
    cleanup_correction_counts: cleanupCounts,
    fallback_only_country_count: fallbackOnlyCountries.length,
    enriched_country_count: waqiEnrichedCountries.length,
    hierarchy_restoration_success_rate_percent: restorationSuccessRate,
    region_equals_city_patterns: regionEqualsCityPatterns,
    duplicated_hierarchy_layers: duplicatedHierarchyLayers,
  };

  const comparison = {
    openweather_only_coverage_countries: openWeatherOnlyFallbackCountries.length,
    waqi_enhanced_coverage_countries: waqiEnrichedCountries.length,
    openaq_effective_contribution_countries_federation: providerCountryContribution.OpenAQ,
    openaq_effective_contribution_countries_cleaned: sanitizedProviderCountryContribution.OpenAQ || 0,
    provider_redundancy_quality_overlap_ratio: round2((providerOverlapNodes / Math.max(1, totalRegionalNodes)) * 100),
    provider_dependency_concentration: providerDependencyRatios,
    hierarchy_depth_contribution: {
      OpenWeather: round2((providerCountryContribution.OpenWeather / Math.max(1, regionalCountries.length)) * 100),
      WAQI: round2((providerCountryContribution.WAQI / Math.max(1, regionalCountries.length)) * 100),
      OpenAQ: round2((providerCountryContribution.OpenAQ / Math.max(1, regionalCountries.length)) * 100),
    },
  };

  const strongestHierarchyCountries = sanitizedCountryDepth
    .slice()
    .sort((a, b) => (b.states * 10000 + b.cities) - (a.states * 10000 + a.cities))
    .slice(0, 15);

  const weakestHierarchyCountries = sanitizedCountryDepth
    .slice()
    .sort((a, b) => (a.states * 10000 + a.cities) - (b.states * 10000 + b.cities))
    .slice(0, 15);

  const observations = {
    weak_regions_globally: fallbackOnlyCountries.slice(0, 40),
    strongest_hierarchy_regions_globally: strongestHierarchyCountries.map(c => c.country),
    countries_with_true_multi_level_hierarchy: sanitizedCountryDepth.filter(c => c.states > 1 && c.cities > 100).map(c => c.country),
    countries_with_only_capital_level_fallback: openWeatherOnlyFallbackCountries,
    regions_with_synthetic_hierarchy_inflation: perCountryFederation.filter(c => c.synthetic_nodes > c.true_admin_regions).map(c => c.country),
    hierarchy_consistency_problems: [
      `Cross-country leak signatures remain high in cleaned validation (${diagnostics?.validation?.report?.issues?.cross_country_leaks?.length || 0} leak labels).`,
      `Region == city duplication patterns detected: ${regionEqualsCityPatterns}.`,
      `Duplicated hierarchy layer patterns detected: ${duplicatedHierarchyLayers}.`
    ],
    provider_imbalance_observations: [
      `OpenWeather appears in ${providerCountryContribution.OpenWeather}/${regionalCountries.length} federation countries.`,
      `WAQI appears in ${providerCountryContribution.WAQI}/${regionalCountries.length} federation countries.`,
      `OpenAQ is inactive in federation map (${providerCountryContribution.OpenAQ}/${regionalCountries.length} countries with OpenAQ available status).`
    ],
    cleanup_impact: {
      hierarchy_restoration_improvements: [
        `Country retention after cleanup: ${diagnostics?.stats?.output_countries || 0}/${diagnostics?.stats?.input_countries || 0}.`,
        `Unknown placeholder states normalized: ${cleanupCounts.placeholder_state_normalized || 0}.`,
        `Malformed country keys removed: ${cleanupCounts.malformed_country_key || 0}.`
      ],
      normalization_success_areas: [
        `Station-label removals: ${cleanupCounts.station_label_only || 0}.`,
        `Invalid coordinate removals: ${cleanupCounts.invalid_coordinates || 0}.`,
        `Within-state duplicate removals: ${cleanupCounts.cross_country_duplicate || 0}.`
      ],
      unresolved_hierarchy_gaps: [
        `Fallback-only countries remain: ${fallbackOnlyCountries.length}.`,
        `OpenAQ inactive countries in federation map: ${openaqInactiveCountries.length}.`
      ],
      unresolved_sparse_regions: weakestHierarchyCountries.map(c => `${c.country} (${c.states} states, ${c.cities} cities)`),
      provider_data_inconsistencies: [
        'Regional coverage map uses city-centric nodes for many countries and fallback nodes for others.',
        'Raw discovered hierarchy still contains cross-country contamination signatures that cleanup does not fully remove.'
      ],
      hierarchy_reconstruction_quality: {
        completeness_score: completenessScore,
        authenticity_score: authenticityScore,
        restoration_success_rate: restorationSuccessRate,
      }
    }
  };

  const report = {
    generated_at: new Date().toISOString(),
    data_sources: {
      countries_registry: path.join(serverDir, 'countries_193.json'),
      provider_federation_country_map: path.join(serverDir, 'coverage_map.json'),
      provider_federation_regional_map: path.join(serverDir, 'regional_coverage.json'),
      raw_discovered_hierarchy: path.join(serverDir, 'aqi_coverage_map.json'),
      sanitized_hierarchy: latestSanitizedPath,
      cleanup_diagnostics: latestDiagnosticsPath,
      fallback_resolution_order: ['OpenAQ', 'WAQI', 'OpenWeather', 'country-level OpenWeather fallback']
    },
    metrics,
    provider_level_comparison: comparison,
    provider_contribution_per_country: {
      federation_countries: providerCountryContribution,
      cleaned_hierarchy_countries: sanitizedProviderCountryContribution
    },
    per_country_federation_analysis: perCountryFederation,
    strongest_hierarchy_countries: strongestHierarchyCountries,
    weakest_hierarchy_countries: weakestHierarchyCountries,
    fallback_only_countries: fallbackOnlyCountries,
    waqi_enriched_countries: waqiEnrichedCountries,
    openaq_inactive_countries: openaqInactiveCountries,
    observations,
    validation_notes: [
      'Administrative regions are considered true only when region names are explicitly discovered in raw hierarchy state keys for the same country.',
      'Capital/Center and General Region nodes are treated as synthetic fallback/normalization constructs.',
      'No city is treated as an administrative region unless explicit state evidence exists in discovered provider data.'
    ]
  };

  return report;
}

function toMarkdown(report) {
  const lines = [];
  const m = report.metrics;
  const p = report.provider_level_comparison;

  lines.push('# REAL AQI Hierarchy Coverage Analysis Report');
  lines.push('');
  lines.push(`Generated: ${report.generated_at}`);
  lines.push('');
  lines.push('## Scope and Validation');
  lines.push('- Uses only runtime/discovered artifacts currently present in this workspace.');
  lines.push('- Distinguishes true administrative hierarchy from synthetic/fallback nodes.');
  lines.push('- Does not assume hierarchy depth beyond explicit provider-discovered data.');
  lines.push('');
  lines.push('## Core Metrics');
  lines.push(`- Total federation countries: ${m.total_countries_federation}`);
  lines.push(`- Total cleaned effective countries: ${m.total_countries_effective_cleaned}`);
  lines.push(`- Total cleaned states/regions: ${m.total_states_effective_cleaned}`);
  lines.push(`- Cleaned administrative regions: ${m.total_cleaned_administrative_regions}`);
  lines.push(`- Cleaned provider-locality regions: ${m.total_cleaned_provider_locality_regions}`);
  lines.push(`- Cleaned synthetic fallback regions: ${m.total_cleaned_synthetic_regions}`);
  lines.push(`- Total real administrative regions: ${m.total_real_administrative_regions}`);
  lines.push(`- Total synthetic regions: ${m.total_synthetic_regions}`);
  lines.push(`- Total pseudo regions: ${m.total_pseudo_regions}`);
  lines.push(`- Total capital-only fallback regions: ${m.total_capital_fallback_regions}`);
  lines.push(`- Total cleaned cities: ${m.total_cities_effective_cleaned}`);
  lines.push(`- Provider overlap nodes: ${m.provider_coverage_overlap_nodes}`);
  lines.push(`- Fallback activation frequency (node-level): ${m.fallback_activation_frequency_nodes}`);
  lines.push(`- Fallback-only country count: ${m.fallback_only_country_count}`);
  lines.push(`- Enriched-country count (WAQI available): ${m.enriched_country_count}`);
  lines.push(`- Hierarchy restoration success rate: ${m.hierarchy_restoration_success_rate_percent}%`);
  lines.push(`- Hierarchy completeness score: ${m.hierarchy_completeness_score}`);
  lines.push(`- Hierarchy authenticity score: ${m.hierarchy_authenticity_score}`);
  lines.push('');
  lines.push('## Provider-Level Comparison');
  lines.push(`- OpenWeather-only fallback coverage countries: ${p.openweather_only_coverage_countries}`);
  lines.push(`- WAQI-enhanced coverage countries: ${p.waqi_enhanced_coverage_countries}`);
  lines.push(`- OpenAQ effective contribution (federation countries): ${p.openaq_effective_contribution_countries_federation}`);
  lines.push(`- OpenAQ effective contribution (cleaned hierarchy countries): ${p.openaq_effective_contribution_countries_cleaned}`);
  lines.push(`- Provider redundancy quality overlap ratio: ${p.provider_redundancy_quality_overlap_ratio}%`);
  lines.push(`- Provider dependency concentration: OpenWeather ${m.provider_dependency_ratios.openweather_dependency_ratio}%, WAQI ${m.provider_dependency_ratios.waqi_dependency_ratio}%, OpenAQ ${m.provider_dependency_ratios.openaq_dependency_ratio}%`);
  lines.push('');
  lines.push('## Hierarchy Quality Observations');
  report.observations.hierarchy_consistency_problems.forEach(x => lines.push(`- ${x}`));
  lines.push('');
  report.observations.provider_imbalance_observations.forEach(x => lines.push(`- ${x}`));
  lines.push('');
  lines.push('## Cleanup Impact Observations');
  report.observations.cleanup_impact.hierarchy_restoration_improvements.forEach(x => lines.push(`- ${x}`));
  report.observations.cleanup_impact.normalization_success_areas.forEach(x => lines.push(`- ${x}`));
  report.observations.cleanup_impact.unresolved_hierarchy_gaps.forEach(x => lines.push(`- ${x}`));
  lines.push('');
  lines.push('## Strongest Countries by Effective Depth (Top 15)');
  report.strongest_hierarchy_countries.forEach(c => {
    lines.push(`- ${c.country}: ${c.states} states, ${c.cities} cities, providers=${c.providers.join(', ') || 'none'}`);
  });
  lines.push('');
  lines.push('## Weakest Countries by Effective Depth (Top 15)');
  report.weakest_hierarchy_countries.forEach(c => {
    lines.push(`- ${c.country}: ${c.states} states, ${c.cities} cities, providers=${c.providers.join(', ') || 'none'}`);
  });
  lines.push('');
  lines.push('## Validation Rules Applied');
  report.validation_notes.forEach(x => lines.push(`- ${x}`));

  return lines.join('\n');
}

function main() {
  const report = analyze();

  const jsonPath = path.join(__dirname, 'REAL_AQI_HIERARCHY_COVERAGE_ANALYSIS.json');
  const mdPath = path.join(__dirname, 'REAL_AQI_HIERARCHY_COVERAGE_ANALYSIS.md');

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, toMarkdown(report));

  console.log(`Generated JSON report: ${jsonPath}`);
  console.log(`Generated Markdown report: ${mdPath}`);
  console.log(`Federation countries: ${report.metrics.total_countries_federation}`);
  console.log(`Cleaned effective countries: ${report.metrics.total_countries_effective_cleaned}`);
  console.log(`Fallback-only countries: ${report.metrics.fallback_only_country_count}`);
  console.log(`Completeness score: ${report.metrics.hierarchy_completeness_score}`);
  console.log(`Authenticity score: ${report.metrics.hierarchy_authenticity_score}`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`Coverage analysis failed: ${err.message}`);
    process.exit(1);
  }
}
