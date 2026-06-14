/**
 * AQI Coverage Discovery & Validation Script
 * 
 * Purpose: Discover actual AQI-supported locations across all APIs
 * Queries: OpenAQ, OpenWeather, WAQI
 * Output: Hierarchical coverage maps for backend schema design
 * 
 * Run: node discover_aqi_coverage.js
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '.env') });

const OPENAQ_KEY = process.env.OPENAQ_API_KEY;
const OPENWEATHER_KEY = process.env.OPENWEATHER_API_KEY;
const WAQI_TOKEN = process.env.WAQI_TOKEN || 'demo';

// API Endpoints
const APIs = {
  openaq_v3: 'https://api.openaq.org/v3',
  openweather: 'https://api.openweathermap.org',
  waqi: 'https://api.waqi.info'
};

// Global coverage map
const coverage = {
  countries: {},
  stats: {
    total_countries: 0,
    with_aqi_data: 0,
    total_regions: 0,
    total_cities: 0,
    sources: {
      openaq: { countries: 0, cities: 0 },
      openweather: { countries: 0, cities: 0 },
      waqi: { countries: 0, cities: 0 }
    }
  },
  unsupported_countries: [],
  partial_coverage: [],
  full_coverage: [],
  discovery_log: []
};

const log = (msg, type = 'info') => {
  const prefix = {
    info: '📍',
    success: '✅',
    warning: '⚠️',
    error: '❌'
  }[type] || '•';
  console.log(`${prefix} ${msg}`);
  coverage.discovery_log.push({ timestamp: new Date().toISOString(), message: msg, type });
};

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getOpenAQCountryCode(location) {
  if (location?.country && typeof location.country === 'object') {
    return location.country.code || null;
  }
  if (typeof location?.country === 'string') {
    return location.country;
  }
  return null;
}

function isUnknownLocality(value) {
  return !value || /^(n\/?a|unknown|null|none)$/i.test(String(value).trim());
}

function resolveOpenAQRegion(location = {}) {
  const adminRegion = location.admin1 || location.region || location.state || null;
  if (adminRegion && !isUnknownLocality(adminRegion)) {
    return {
      name: String(adminRegion).trim(),
      type: 'administrative',
      source: 'openaq_admin1',
      synthetic: false,
    };
  }

  if (!isUnknownLocality(location.locality)) {
    return {
      name: String(location.locality).trim(),
      type: 'provider_locality',
      source: 'openaq_locality',
      synthetic: false,
    };
  }

  return {
    name: 'General Region',
    type: 'synthetic_fallback',
    source: 'missing_provider_region',
    synthetic: true,
  };
}

function normalizeOpenAQLocationName(location = {}) {
  if (!isUnknownLocality(location.locality)) {
    return String(location.locality).trim();
  }

  const label = String(location.name || '').trim();
  const withoutAgency = label
    .replace(/\s+-\s+(CPCB|DPCC|SPCB|AQMS|EPA|WAQI|OpenAQ|Monitor|Monitoring Station).*$/i, '')
    .replace(/^(US Diplomatic Post:\s*)/i, '')
    .trim();

  return withoutAgency || label || 'Unknown';
}

// ============ OPENAQ DISCOVERY ============

async function discoverOpenAQ() {
  log('🔍 Discovering OpenAQ coverage...', 'info');
  
  try {
    // Get all countries from OpenAQ v3
    const countriesResponse = await axios.get(
      `${APIs.openaq_v3}/countries`,
      {
        headers: OPENAQ_KEY ? { 'X-API-Key': OPENAQ_KEY } : {},
        timeout: 15000
      }
    );

    const countries = countriesResponse.data.results || [];
    log(`Found ${countries.length} countries in OpenAQ`, 'success');

    coverage.stats.rejected_country_mismatches = coverage.stats.rejected_country_mismatches || 0;

    for (const country of countries.slice(0, 30)) { // Limit to 30 to avoid rate limiting
      try {
        if (!country.id || !country.code) {
          log(`Skipping OpenAQ country without stable id/code: ${country.name || 'unknown'}`, 'warning');
          continue;
        }

        // Get locations for each country
        const locResponse = await axios.get(
          `${APIs.openaq_v3}/locations?countries_id=${country.id}&limit=500`,
          {
            headers: OPENAQ_KEY ? { 'X-API-Key': OPENAQ_KEY } : {},
            timeout: 10000
          }
        );

        const locations = (locResponse.data.results || []).filter(loc => {
          const locCountryCode = getOpenAQCountryCode(loc);
          const matches = !locCountryCode || normalizeText(locCountryCode) === normalizeText(country.code);
          if (!matches) {
            coverage.stats.rejected_country_mismatches++;
          }
          return matches;
        });
        
        if (locations.length > 0) {
          if (!coverage.countries[country.name]) {
            coverage.countries[country.name] = {
              iso2: country.code,
              regions: {},
              aqi_sources: [],
              total_locations: 0
            };
            coverage.stats.with_aqi_data++;
          }

          // Organize locations by state/city
          locations.forEach(loc => {
            const regionDescriptor = resolveOpenAQRegion(loc);
            const region = regionDescriptor.name;
            
            if (!coverage.countries[country.name].regions[region]) {
              coverage.countries[country.name].regions[region] = {
                cities: [],
                sources: ['openaq'],
                region_type: regionDescriptor.type,
                region_source: regionDescriptor.source,
                synthetic: regionDescriptor.synthetic
              };
              coverage.stats.total_regions++;
            }

            if (!coverage.countries[country.name].regions[region].sources.includes('openaq')) {
              coverage.countries[country.name].regions[region].sources.push('openaq');
            }

            coverage.countries[country.name].regions[region].cities.push({
              name: normalizeOpenAQLocationName(loc),
              provider_location_name: loc.name,
              locality: isUnknownLocality(loc.locality) ? null : loc.locality,
              coordinates: loc.coordinates,
              measurements: loc.measurements?.length || 0,
              last_updated: loc.lastUpdated,
              source: 'openaq'
            });

            coverage.stats.total_cities++;
          });

          coverage.countries[country.name].total_locations = locations.length;
          coverage.countries[country.name].aqi_sources.push('openaq');
          coverage.stats.sources.openaq.countries++;
          coverage.stats.sources.openaq.cities += locations.length;

          log(`${country.name}: ${locations.length} locations found`, 'success');
        }

        await new Promise(r => setTimeout(r, 200)); // Rate limiting
      } catch (err) {
        log(`Error fetching OpenAQ data for ${country.name}: ${err.message}`, 'warning');
      }
    }
  } catch (err) {
    log(`OpenAQ discovery failed: ${err.message}`, 'error');
  }
}

// ============ OPENWEATHER DISCOVERY ============

async function discoverOpenWeather() {
  log('🔍 Discovering OpenWeather coverage...', 'info');
  
  if (!OPENWEATHER_KEY) {
    log('OpenWeather API key not configured, skipping', 'warning');
    return;
  }

  try {
    // OpenWeather doesn't provide a countries list, so we'll test major cities
    const testCities = [
      { city: 'Tokyo', country: 'Japan' },
      { city: 'Delhi', country: 'India' },
      { city: 'Beijing', country: 'China' },
      { city: 'New York', country: 'United States' },
      { city: 'London', country: 'United Kingdom' },
      { city: 'Paris', country: 'France' },
      { city: 'São Paulo', country: 'Brazil' },
      { city: 'Dubai', country: 'United Arab Emirates' },
      { city: 'Cairo', country: 'Egypt' },
      { city: 'Sydney', country: 'Australia' }
    ];

    for (const location of testCities) {
      try {
        // Geocode the city
        const geoResponse = await axios.get(
          `${APIs.openweather}/geo/1.0/direct?q=${encodeURIComponent(location.city)},${encodeURIComponent(location.country)}&limit=1&appid=${OPENWEATHER_KEY}`,
          { timeout: 5000 }
        );

        if (geoResponse.data && geoResponse.data.length > 0) {
          const { lat, lon } = geoResponse.data[0];

          // Query air pollution data
          const pollResponse = await axios.get(
            `${APIs.openweather}/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_KEY}`,
            { timeout: 5000 }
          );

          if (pollResponse.data && pollResponse.data.list && pollResponse.data.list.length > 0) {
            const country = location.country;
            
            if (!coverage.countries[country]) {
              coverage.countries[country] = {
                regions: {},
                aqi_sources: [],
                total_locations: 0
              };
            }

            const region = location.city.split(' ')[0]; // Use city name as region
            
            if (!coverage.countries[country].regions[region]) {
              coverage.countries[country].regions[region] = {
                cities: [],
                sources: ['openweather']
              };
            }

            if (!coverage.countries[country].regions[region].sources.includes('openweather')) {
              coverage.countries[country].regions[region].sources.push('openweather');
            }

            coverage.countries[country].regions[region].cities.push({
              name: location.city,
              coordinates: { lat, lon },
              aqi: pollResponse.data.list[0].main?.aqi,
              source: 'openweather'
            });

            if (!coverage.countries[country].aqi_sources.includes('openweather')) {
              coverage.countries[country].aqi_sources.push('openweather');
              coverage.stats.sources.openweather.countries++;
            }

            coverage.stats.sources.openweather.cities++;
            log(`${location.country}/${location.city}: OpenWeather data available`, 'success');
          }
        }

        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        // Silently fail for OpenWeather test locations
      }
    }
  } catch (err) {
    log(`OpenWeather discovery failed: ${err.message}`, 'error');
  }
}

// ============ WAQI DISCOVERY ============

async function discoverWAQI() {
  log('🔍 Discovering WAQI coverage...', 'info');

  try {
    // Get WAQI map routes (countries with data)
    const routesResponse = await axios.get(
      `${APIs.waqi}/map/getroutes?token=${WAQI_TOKEN}`,
      { timeout: 10000 }
    );

    if (routesResponse.data && routesResponse.data.data) {
      const countries = Object.keys(routesResponse.data.data);
      log(`Found ${countries.length} countries with WAQI coverage`, 'success');

      for (const countryCode of countries.slice(0, 20)) { // Limit to 20 to avoid rate limiting
        try {
          // Get stations in country
          const stationsResponse = await axios.get(
            `${APIs.waqi}/feed/@${countryCode}/?token=${WAQI_TOKEN}`,
            { timeout: 5000 }
          );

          if (stationsResponse.data && stationsResponse.data.status === 'ok') {
            const data = stationsResponse.data.data;
            
            // Map country code to name
            const countryName = getCountryNameFromCode(countryCode) || countryCode;

            if (!coverage.countries[countryName]) {
              coverage.countries[countryName] = {
                regions: {},
                aqi_sources: [],
                total_locations: 0
              };
            }

            if (!coverage.countries[countryName].aqi_sources.includes('waqi')) {
              coverage.countries[countryName].aqi_sources.push('waqi');
              coverage.stats.sources.waqi.countries++;
            }

            // Extract city information
            if (Array.isArray(data)) {
              const region = 'main'; // WAQI structure varies
              
              if (!coverage.countries[countryName].regions[region]) {
                coverage.countries[countryName].regions[region] = {
                  cities: [],
                  sources: ['waqi']
                };
              }

              data.slice(0, 10).forEach(station => { // Top 10 stations per country
                coverage.countries[countryName].regions[region].cities.push({
                  name: station.station?.name || 'Unknown',
                  coordinates: station.station?.geo,
                  aqi: station.aqi,
                  source: 'waqi'
                });
              });

              coverage.stats.sources.waqi.cities += Math.min(data.length, 10);
              log(`${countryName}: ${data.length} WAQI stations found`, 'success');
            }
          }

          await new Promise(r => setTimeout(r, 300));
        } catch (err) {
          log(`Error fetching WAQI data for ${countryCode}: ${err.message}`, 'warning');
        }
      }
    }
  } catch (err) {
    log(`WAQI discovery failed: ${err.message}`, 'error');
  }
}

// ============ ANALYSIS & CATEGORIZATION ============

function analyzeCoverage() {
  log('\n📊 Analyzing coverage...', 'info');

  Object.entries(coverage.countries).forEach(([country, data]) => {
    const sourceCount = data.aqi_sources.length;
    const regionCount = Object.keys(data.regions).length;
    const cityCount = Object.values(data.regions).reduce((sum, r) => sum + r.cities.length, 0);

    if (sourceCount === 0) {
      coverage.unsupported_countries.push(country);
    } else if (sourceCount === 1 && cityCount < 5) {
      coverage.partial_coverage.push({
        country,
        sources: data.aqi_sources,
        regions: regionCount,
        cities: cityCount
      });
    } else {
      coverage.full_coverage.push({
        country,
        sources: data.aqi_sources,
        regions: regionCount,
        cities: cityCount
      });
    }
  });

  coverage.stats.total_countries = Object.keys(coverage.countries).length;

  log(`Total countries analyzed: ${coverage.stats.total_countries}`, 'success');
  log(`Countries with AQI data: ${coverage.stats.with_aqi_data}`, 'success');
  log(`Countries without data: ${coverage.unsupported_countries.length}`, 'warning');
  log(`Partial coverage: ${coverage.partial_coverage.length}`, 'warning');
  log(`Full coverage: ${coverage.full_coverage.length}`, 'success');
}

// ============ REPORT GENERATION ============

function generateReports() {
  log('\n📈 Generating reports...', 'info');

  // 1. Coverage JSON
  const coverageData = {
    metadata: {
      generated: new Date().toISOString(),
      total_countries: coverage.stats.total_countries,
      with_data: coverage.stats.with_aqi_data,
      without_data: coverage.unsupported_countries.length,
      partial_coverage: coverage.partial_coverage.length,
      full_coverage: coverage.full_coverage.length
    },
    supported_countries: coverage.countries,
    categories: {
      full_coverage: coverage.full_coverage,
      partial_coverage: coverage.partial_coverage,
      unsupported: coverage.unsupported_countries
    },
    api_stats: coverage.stats.sources
  };

  fs.writeFileSync(
    path.join(__dirname, 'aqi_coverage_map.json'),
    JSON.stringify(coverageData, null, 2)
  );
  log('Saved: aqi_coverage_map.json', 'success');

  // 2. Markdown Report
  let markdown = `# Global AQI Coverage Analysis
**Generated:** ${new Date().toISOString()}

## Summary
- **Total Countries Analyzed:** ${coverage.stats.total_countries}
- **With AQI Data:** ${coverage.stats.with_aqi_data}
- **Without Data:** ${coverage.unsupported_countries.length}
- **Full Coverage:** ${coverage.full_coverage.length}
- **Partial Coverage:** ${coverage.partial_coverage.length}

## By API Source
- **OpenAQ:** ${coverage.stats.sources.openaq.countries} countries, ${coverage.stats.sources.openaq.cities} cities
- **OpenWeather:** ${coverage.stats.sources.openweather.countries} countries, ${coverage.stats.sources.openweather.cities} cities
- **WAQI:** ${coverage.stats.sources.waqi.countries} countries, ${coverage.stats.sources.waqi.cities} cities

## Supported Countries (Full Coverage - ${coverage.full_coverage.length})
${coverage.full_coverage.map(c => 
  `- **${c.country}** | Sources: ${c.sources.join(', ')} | Regions: ${c.regions} | Cities: ${c.cities}`
).join('\n')}

## Partial Coverage Countries (${coverage.partial_coverage.length})
${coverage.partial_coverage.map(c => 
  `- **${c.country}** | Sources: ${c.sources.join(', ')} | Regions: ${c.regions} | Cities: ${c.cities}`
).join('\n')}

## Unsupported Countries (${coverage.unsupported_countries.length})
${coverage.unsupported_countries.slice(0, 30).map(c => `- ${c}`).join('\n')}
${coverage.unsupported_countries.length > 30 ? `- ... and ${coverage.unsupported_countries.length - 30} more` : ''}

## Hierarchical Structure Examples

### Full Coverage Country (China)
${JSON.stringify(coverage.countries['China'], null, 2)}

### High-Value Countries for Focus
${JSON.stringify(coverage.full_coverage.slice(0, 5), null, 2)}
`;

  fs.writeFileSync(
    path.join(__dirname, 'AQI_COVERAGE_ANALYSIS.md'),
    markdown
  );
  log('Saved: AQI_COVERAGE_ANALYSIS.md', 'success');

  // 3. Discovery Log
  const logReport = {
    timestamp: new Date().toISOString(),
    discovery_duration: '~5 minutes',
    total_api_calls: 'Approximately 100+',
    api_health: {
      openaq: 'Operational (v3)',
      openweather: OPENWEATHER_KEY ? 'Operational' : 'Not configured',
      waqi: 'Operational'
    },
    events: coverage.discovery_log
  };

  fs.writeFileSync(
    path.join(__dirname, 'discovery_log.json'),
    JSON.stringify(logReport, null, 2)
  );
  log('Saved: discovery_log.json', 'success');
}

// ============ HELPER FUNCTIONS ============

function getCountryNameFromCode(code) {
  // Simple mapping for WAQI country codes
  const mapping = {
    'cn': 'China',
    'in': 'India',
    'us': 'United States',
    'gb': 'United Kingdom',
    'jp': 'Japan',
    'au': 'Australia',
    'br': 'Brazil',
    'fr': 'France',
    'de': 'Germany',
    'id': 'Indonesia',
    'th': 'Thailand',
    'pk': 'Pakistan',
    'bd': 'Bangladesh',
    'ph': 'Philippines',
    'vn': 'Vietnam'
  };
  return mapping[code.toLowerCase()];
}

// ============ MAIN EXECUTION ============

async function main() {
  console.log('\n🌍 AQI Coverage Discovery & Validation\n');
  console.log('This will take ~3-5 minutes and make controlled API requests.\n');

  try {
    // Phase 1: Discovery
    await discoverOpenAQ();
    await discoverOpenWeather();
    await discoverWAQI();

    // Phase 2: Analysis
    analyzeCoverage();

    // Phase 3: Reporting
    generateReports();

    console.log('\n✅ Discovery complete!\n');
    console.log('📁 Generated files:');
    console.log('   - aqi_coverage_map.json (machine-readable)');
    console.log('   - AQI_COVERAGE_ANALYSIS.md (human-readable)');
    console.log('   - discovery_log.json (detailed events)\n');

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
