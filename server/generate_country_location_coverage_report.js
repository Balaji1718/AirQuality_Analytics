#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseArgs(argv) {
  const args = { output: null };

  for (const value of argv.slice(2)) {
    if (value.startsWith('--output=')) {
      args.output = value.slice('--output='.length).replace(/^['"]|['"]$/g, '');
    }
  }

  return args;
}

function canonicalSourceLabel(source) {
  if (!source) return null;
  const normalized = String(source).toLowerCase();
  if (normalized.includes('openaq')) return 'OpenAQ';
  if (normalized.includes('waqi')) return 'WAQI';
  if (normalized.includes('openweather')) return 'OpenWeather';
  return source;
}

function normalizeSources(values) {
  const canonical = new Set();

  for (const value of values) {
    const label = canonicalSourceLabel(value);
    if (label) {
      canonical.add(label);
    }
  }

  return [...canonical].sort((a, b) => a.localeCompare(b));
}

function buildRegionNodes(countryName, regionalEntry) {
  const regionEntries = Object.entries(regionalEntry?.regions || {});

  return regionEntries.map(([regionName, regionData]) => {
    const regionSources = new Set();
    const apiMap = regionData?.apis || {};

    Object.entries(apiMap).forEach(([source, status]) => {
      if (status === 'available' || status === true) {
        regionSources.add(source);
        return;
      }

      if (status === 'fallback' && String(source).toLowerCase().includes('openweather')) {
        regionSources.add(source);
      }
    });

    if (regionSources.size === 0 && Array.isArray(regionalEntry?.primary_apis)) {
      regionalEntry.primary_apis.forEach(source => regionSources.add(source));
    }

    const canonicalSources = normalizeSources(regionSources);
    const sampleAqi = typeof regionData?.sample_aqi === 'number' ? regionData.sample_aqi : null;
    const verified = Boolean(regionData?.verified);
    const cities = [
      {
        name: regionName,
        source: canonicalSources[0] || 'OpenWeather',
        sources: canonicalSources,
        verified,
        sampleAqi,
        fallbackMethod: regionData?.fallback_method || null,
      },
    ];

    return {
      name: regionName,
      sources: canonicalSources,
      hasData: Boolean(regionData?.hasData),
      verified,
      sampleAqi,
      cities,
    };
  });
}

function buildCountryNode(country, countryCoverage, regionalEntry) {
  const sources = new Set();
  const coverageApis = countryCoverage?.apis || {};
  Object.entries(coverageApis).forEach(([source, isEnabled]) => {
    if (isEnabled) sources.add(source);
  });

  if (Array.isArray(regionalEntry?.primary_apis)) {
    regionalEntry.primary_apis.forEach(source => {
      const normalized = canonicalSourceLabel(source);
      if (normalized) {
        sources.add(normalized);
      }
    });
  }

  const regions = buildRegionNodes(country.name, regionalEntry);
  const detailedRegions = typeof regionalEntry?.total_regions === 'number' ? regionalEntry.total_regions : 0;
  const fallbackOnly = detailedRegions === 0;

  return {
    id: country.id,
    name: country.name,
    iso2: country.iso2,
    iso3: country.iso3,
    region: country.region,
    sources: normalizeSources(sources),
    hasAnyData: Boolean(countryCoverage?.hasData ?? regionalEntry?.has_any_data ?? false),
    detailedRegions,
    fallbackOnly,
    regions,
  };
}

function summarizeCountry(countryNode) {
  return {
    regionCount: countryNode.regions.length,
    cityCount: countryNode.regions.reduce((sum, region) => sum + region.cities.length, 0),
    sources: countryNode.sources,
  };
}

function buildRegionSummary(countries) {
  const summary = {
    Africa: { countries: 0, detailedCountries: 0, regionNodes: 0, cityNodes: 0 },
    Americas: { countries: 0, detailedCountries: 0, regionNodes: 0, cityNodes: 0 },
    Asia: { countries: 0, detailedCountries: 0, regionNodes: 0, cityNodes: 0 },
    Europe: { countries: 0, detailedCountries: 0, regionNodes: 0, cityNodes: 0 },
    Oceania: { countries: 0, detailedCountries: 0, regionNodes: 0, cityNodes: 0 },
  };

  for (const country of countries) {
    const bucket = summary[country.region] || (summary[country.region] = { countries: 0, detailedCountries: 0, regionNodes: 0, cityNodes: 0 });
    bucket.countries += 1;
    if (country.detailedRegions > 0) bucket.detailedCountries += 1;
    bucket.regionNodes += country.regions.length;
    bucket.cityNodes += country.regions.reduce((sum, region) => sum + region.cities.length, 0);
  }

  return summary;
}

function buildMarkdown({ countries, countryCoverageMap, regionalCoverageMap, counts }) {
  const generatedAt = new Date().toISOString();
  const lines = [];

  lines.push('# Global Air Quality Coverage Report');
  lines.push(`**Generated:** ${generatedAt}`);
  lines.push(`**Source country list:** countries_193.json (runtime source in this workspace)`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- **Total Countries:** ${counts.totalCountries}`);
  lines.push(`- **Countries with Any Data:** ${counts.countriesWithAnyData} (${Math.round((counts.countriesWithAnyData / counts.totalCountries) * 100)}%)`);
  lines.push(`- **Countries with Detailed Regional Data:** ${counts.countriesWithDetailedRegions}`);
  lines.push(`- **Countries with Fallback Coverage Only:** ${counts.countriesWithFallbackOnly}`);
  lines.push(`- **Region Nodes:** ${counts.regionNodes}`);
  lines.push(`- **City Nodes:** ${counts.cityNodes}`);
  lines.push('');
  lines.push('## API Coverage Breakdown');
  lines.push(`- **OpenAQ:** ${counts.apiCountryCounts.OpenAQ} countries`);
  lines.push(`- **WAQI:** ${counts.apiCountryCounts.WAQI} countries`);
  lines.push(`- **OpenWeather:** ${counts.apiCountryCounts.OpenWeather} countries`);
  lines.push('');
  lines.push('## Regional Breakdown');

  for (const [regionName, stats] of Object.entries(counts.byRegion)) {
    lines.push('');
    lines.push(`### ${regionName}`);
    lines.push(`- **Countries:** ${stats.countries}`);
    lines.push(`- **Countries with Detailed Regional Data:** ${stats.detailedCountries}`);
    lines.push(`- **Region Nodes:** ${stats.regionNodes}`);
    lines.push(`- **City Nodes:** ${stats.cityNodes}`);
  }

  lines.push('');
  lines.push('## Hierarchical Coverage');
  lines.push('The hierarchy below is ordered as Country -> State/Region -> City.');

  for (const regionName of Object.keys(counts.byRegion)) {
    const regionCountries = countries.filter(country => country.region === regionName);
    if (regionCountries.length === 0) continue;

    lines.push('');
    lines.push(`### ${regionName}`);

    for (const country of regionCountries) {
      const summary = summarizeCountry(country);
      const sources = country.sources.length > 0 ? country.sources.join(', ') : 'None';
      const coverageType = country.detailedRegions > 0 ? 'Detailed regional coverage' : 'Fallback country-center coverage';

      lines.push('');
      lines.push(`#### ${country.name} (${country.iso2})`);
      lines.push(`- **Coverage Type:** ${coverageType}`);
      lines.push(`- **Primary Sources:** ${sources}`);
      lines.push(`- **Region Nodes:** ${summary.regionCount}`);
      lines.push(`- **City Nodes:** ${summary.cityCount}`);

      for (const region of country.regions) {
        lines.push(`  - ${region.name}`);
        lines.push(`    - **Sources:** ${region.sources.length > 0 ? region.sources.join(', ') : 'OpenWeather'}`);
        lines.push(`    - **City:** ${region.cities[0]?.name || region.name}`);
        if (region.sampleAqi !== null) {
          lines.push(`    - **Sample AQI:** ${region.sampleAqi}`);
        }
      }
    }
  }

  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv);

  const countriesPath = path.join(__dirname, 'countries_193.json');
  const regionalCoveragePath = path.join(__dirname, 'regional_coverage.json');
  const countryCoveragePath = path.join(__dirname, 'coverage_map.json');

  const countriesData = JSON.parse(fs.readFileSync(countriesPath, 'utf8'));
  const regionalCoverageMap = readJsonIfExists(regionalCoveragePath) || {};
  const countryCoverageMap = readJsonIfExists(countryCoveragePath) || {};

  const countries = (countriesData.countries || []).map(country => {
    const countryCoverage = countryCoverageMap[country.name] || null;
    const regionalEntry = regionalCoverageMap[country.name] || {
      iso2: country.iso2,
      iso3: country.iso3,
      region: country.region,
      total_regions: 0,
      regions: {
        'Capital/Center': {
          apis: { openaq: 'no_data', waqi: 'fallback', openweather: 'available' },
          hasData: true,
          verified: false,
          fallback_method: 'country_center_coordinates',
          sample_aqi: null,
        },
      },
      has_any_data: true,
      primary_apis: ['OpenWeather (Fallback)'],
    };

    return buildCountryNode(country, countryCoverage, regionalEntry);
  });

  const counts = {
    totalCountries: countries.length,
    countriesWithAnyData: countries.filter(country => country.hasAnyData).length,
    countriesWithDetailedRegions: countries.filter(country => country.detailedRegions > 0).length,
    countriesWithFallbackOnly: countries.filter(country => country.detailedRegions === 0).length,
    regionNodes: countries.reduce((sum, country) => sum + country.regions.length, 0),
    cityNodes: countries.reduce((sum, country) => sum + country.regions.reduce((regionSum, region) => regionSum + region.cities.length, 0), 0),
    apiCountryCounts: {
      OpenAQ: countries.filter(country => country.sources.includes('OpenAQ')).length,
      WAQI: countries.filter(country => country.sources.includes('WAQI')).length,
      OpenWeather: countries.filter(country => country.sources.includes('OpenWeather')).length,
    },
    byRegion: buildRegionSummary(countries),
  };

  const markdown = buildMarkdown({
    countries,
    countryCoverageMap,
    regionalCoverageMap,
    counts,
  });

  const outputFiles = [
    args.output
      ? (path.isAbsolute(args.output) ? args.output : path.join(__dirname, args.output))
      : path.join(__dirname, 'GLOBAL_COVERAGE_REPORT.md'),
    path.join(__dirname, '..', 'COUNTRY_LOCATION_COVERAGE_REPORT.md'),
  ];

  for (const outputFile of outputFiles) {
    fs.writeFileSync(outputFile, markdown);
  }

  console.log(`Generated report: ${outputFiles[0]}`);
  console.log(`Also wrote compatibility copy: ${outputFiles[1]}`);
  console.log(`Countries: ${counts.totalCountries}`);
  console.log(`Countries with detailed regions: ${counts.countriesWithDetailedRegions}`);
  console.log(`Countries with fallback only: ${counts.countriesWithFallbackOnly}`);
  console.log(`Region nodes: ${counts.regionNodes}`);
  console.log(`City nodes: ${counts.cityNodes}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Report generation failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  buildMarkdown,
  buildCountryNode,
  buildRegionNodes,
};
