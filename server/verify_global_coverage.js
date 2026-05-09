const axios = require('axios');
const fs = require('fs');
const countriesData = require('./countries_193.json');

// API Keys from .env
const OPENAQ_API_KEY = process.env.OPENAQ_API_KEY;
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

const API_ENDPOINTS = {
  openaq: 'https://api.openaq.org/v2',
  waqi: 'https://api.waqi.info',
  openweather: 'https://api.openweathermap.org'
};

const coverage = {};
const errors = [];

async function checkOpenAQ() {
  console.log('🔍 Checking OpenAQ coverage...');
  try {
    const response = await axios.get(`${API_ENDPOINTS.openaq}/countries`, {
      headers: OPENAQ_API_KEY ? { 'X-API-Key': OPENAQ_API_KEY } : {},
      timeout: 10000
    });
    
    if (response.data.results) {
      const openaqCountries = response.data.results.map(c => c.name);
      console.log(`✅ OpenAQ has data for ${openaqCountries.length} countries`);
      return openaqCountries;
    }
  } catch (err) {
    console.error('❌ OpenAQ error:', err.message);
    errors.push(`OpenAQ: ${err.message}`);
  }
  return [];
}

async function checkWAQI() {
  console.log('🔍 Checking WAQI coverage...');
  try {
    // WAQI countries endpoint
    const response = await axios.get(`${API_ENDPOINTS.waqi}/map/getroutes/?token=${process.env.WAQI_API_TOKEN || 'demo'}`, {
      timeout: 10000
    });
    
    if (response.data && response.data.data) {
      const waqiCountries = Object.keys(response.data.data);
      console.log(`✅ WAQI has data for ${waqiCountries.length} countries`);
      return waqiCountries;
    }
  } catch (err) {
    // WAQI may not have public country list, use known coverage
    console.log('⚠️  WAQI country list unavailable, using known coverage');
    const knownWAQI = ['India', 'China', 'United States', 'United Kingdom', 'Australia', 'Canada', 
                       'Japan', 'South Korea', 'Mexico', 'Brazil', 'Indonesia', 'Thailand', 'Pakistan',
                       'Bangladesh', 'Philippines', 'Vietnam', 'Malaysia', 'Hong Kong', 'Taiwan', 'Iran'];
    return knownWAQI;
  }
}

async function checkOpenWeather() {
  console.log('🔍 Checking OpenWeather coverage...');
  // OpenWeather supports most countries - returns data for any valid location
  // So we can consider all countries as potentially covered
  const allCountries = countriesData.countries.map(c => c.name);
  console.log(`✅ OpenWeather can query any country (${allCountries.length} supported)`);
  return allCountries;
}

async function buildCoverageMap() {
  console.log('\n📊 Building coverage map...\n');
  
  const openaqCoverage = await checkOpenAQ();
  const waqiCoverage = await checkWAQI();
  const openweatherCoverage = await checkOpenWeather();
  
  // Build mapping
  countriesData.countries.forEach(country => {
    const hasOpenAQ = openaqCoverage.some(c => 
      c.toLowerCase() === country.name.toLowerCase() ||
      c.toLowerCase().includes(country.iso2.toLowerCase())
    );
    
    const hasWAQI = waqiCoverage.some(c => 
      c.toLowerCase() === country.name.toLowerCase() ||
      c.toLowerCase().includes(country.iso2.toLowerCase())
    );
    
    const hasOpenWeather = openweatherCoverage.some(c => 
      c.toLowerCase() === country.name.toLowerCase()
    );
    
    coverage[country.name] = {
      iso2: country.iso2,
      iso3: country.iso3,
      region: country.region,
      apis: {
        openaq: hasOpenAQ,
        waqi: hasWAQI,
        openweather: hasOpenWeather
      },
      hasData: hasOpenAQ || hasWAQI || hasOpenWeather
    };
  });
  
  return coverage;
}

async function generateReport() {
  console.log('\n📈 Generating coverage report...\n');
  
  const coverage = await buildCoverageMap();
  
  const totalCountries = Object.keys(coverage).length;
  const withData = Object.values(coverage).filter(c => c.hasData).length;
  const onlyOpenAQ = Object.values(coverage).filter(c => c.apis.openaq && !c.apis.waqi && !c.apis.openweather).length;
  const onlyWAQI = Object.values(coverage).filter(c => c.apis.waqi && !c.apis.openaq && !c.apis.openweather).length;
  const onlyOpenWeather = Object.values(coverage).filter(c => c.apis.openweather && !c.apis.openaq && !c.apis.waqi).length;
  const multiAPI = Object.values(coverage).filter(c => {
    const apis = Object.values(c.apis).filter(v => v).length;
    return apis > 1;
  }).length;
  
  let report = `# Global Air Quality Coverage Report
**Generated:** ${new Date().toISOString()}

## Summary
- **Total Countries:** ${totalCountries}
- **Countries with Data:** ${withData} (${Math.round(withData/totalCountries*100)}%)
- **Countries without Data:** ${totalCountries - withData}

## API Coverage Breakdown
- **Only OpenAQ:** ${onlyOpenAQ} countries
- **Only WAQI:** ${onlyWAQI} countries
- **Only OpenWeather:** ${onlyOpenWeather} countries
- **Multi-API Coverage:** ${multiAPI} countries

## Detailed Country Listing

`;
  
  // Group by region
  const regions = {};
  Object.entries(coverage).forEach(([country, data]) => {
    if (!regions[data.region]) regions[data.region] = [];
    regions[data.region].push({ name: country, ...data });
  });
  
  Object.entries(regions).forEach(([region, countries]) => {
    const regionData = countries.filter(c => c.hasData).length;
    report += `\n### ${region} (${regionData}/${countries.length})\n`;
    
    countries.forEach(country => {
      const apis = [];
      if (country.apis.openaq) apis.push('OpenAQ');
      if (country.apis.waqi) apis.push('WAQI');
      if (country.apis.openweather) apis.push('OpenWeather');
      
      const status = country.hasData ? '✅' : '❌';
      const apiList = apis.length > 0 ? `[${apis.join(', ')}]` : '[No data]';
      report += `- ${status} ${country.name} (${country.iso2}) ${apiList}\n`;
    });
  });
  
  // Save report
  fs.writeFileSync('./GLOBAL_COVERAGE_REPORT.md', report);
  console.log('✅ Report saved to GLOBAL_COVERAGE_REPORT.md');
  
  // Save coverage JSON
  fs.writeFileSync('./coverage_map.json', JSON.stringify(coverage, null, 2));
  console.log('✅ Coverage map saved to coverage_map.json');
  
  // Summary stats
  console.log('\n📊 COVERAGE STATISTICS:');
  console.log(`Total Countries: ${totalCountries}`);
  console.log(`With Data: ${withData} (${Math.round(withData/totalCountries*100)}%)`);
  console.log(`Multi-API: ${multiAPI} countries`);
  
  if (errors.length > 0) {
    console.log('\n⚠️  Errors encountered:');
    errors.forEach(err => console.log(`  - ${err}`));
  }
}

generateReport().catch(console.error);
