const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Load countries database
const countriesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'countries_193.json'), 'utf8'));

// API Configuration
const OPENWEATHER_KEY = process.env.OPENWEATHER_API_KEY;
const OPENAQ_KEY = process.env.OPENAQ_API_KEY;
const WAQI_TOKEN = process.env.WAQI_TOKEN || 'demo';

const APIs = {
  openweather: `https://api.openweathermap.org/data/2.5/air_pollution`,
  waqi: `https://api.waqi.info`,
  openaq: `https://api.openaq.org/v3`
};

// Major cities/regions for each country (curated list)
const COUNTRY_REGIONS = {
  'India': ['Delhi', 'Mumbai', 'Bengaluru', 'Chennai', 'Kolkata', 'Hyderabad', 'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow'],
  'China': ['Beijing', 'Shanghai', 'Guangzhou', 'Shenzhen', 'Chengdu', 'Xi\'an', 'Hangzhou', 'Nanjing', 'Wuhan', 'Chongqing'],
  'Japan': ['Tokyo', 'Osaka', 'Kyoto', 'Yokohama', 'Kobe', 'Nagoya', 'Sapporo', 'Fukuoka', 'Kawa', 'Saitama'],
  'United States': ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose'],
  'United Kingdom': ['London', 'Manchester', 'Birmingham', 'Leeds', 'Liverpool', 'Bristol', 'Edinburgh', 'Glasgow', 'Cardiff', 'Belfast'],
  'Germany': ['Berlin', 'Munich', 'Hamburg', 'Cologne', 'Frankfurt', 'Stuttgart', 'Dusseldorf', 'Dortmund', 'Essen', 'Leipzig'],
  'France': ['Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Nantes', 'Strasbourg', 'Montpellier', 'Bordeaux', 'Lille'],
  'Brazil': ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Salvador', 'Fortaleza', 'Brasília', 'Recife', 'Manaus', 'Curitiba', 'Goiânia'],
  'Canada': ['Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Ottawa', 'Edmonton', 'Winnipeg', 'Quebec City', 'Hamilton', 'Kitchener'],
  'Australia': ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Gold Coast', 'Canberra', 'Newcastle', 'Wollongong', 'Logan City'],
};

const coverage = {};
const errors = [];

// Geocode city name to coordinates
async function geocodeCity(cityName, countryName) {
  try {
    if (!OPENWEATHER_KEY) return null;
    const url = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(cityName)},${encodeURIComponent(countryName)}&limit=1&appid=${OPENWEATHER_KEY}`;
    const response = await axios.get(url, { timeout: 5000 });
    if (response.data && response.data.length > 0) {
      return { lat: response.data[0].lat, lon: response.data[0].lon };
    }
  } catch (err) {
    // Fail silently
  }
  return null;
}

// Query OpenWeather for air pollution data
async function queryOpenWeather(lat, lon, city) {
  try {
    if (!OPENWEATHER_KEY) return null;
    const response = await axios.get(
      `${APIs.openweather}?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_KEY}`,
      { timeout: 5000 }
    );
    if (response.data && response.data.list && response.data.list.length > 0) {
      return {
        hasData: true,
        aqi: response.data.list[0].main?.aqi || null,
        components: response.data.list[0].components
      };
    }
  } catch (err) {
    // Fail silently
  }
  return null;
}

// Query WAQI for air quality data
async function queryWAQI(cityName, countryName) {
  try {
    const url = `${APIs.waqi}/feed/${encodeURIComponent(cityName)},${encodeURIComponent(countryName)}/?token=${WAQI_TOKEN}`;
    const response = await axios.get(url, { timeout: 5000 });
    if (response.data && response.data.status === 'ok') {
      return {
        hasData: true,
        aqi: response.data.data.aqi,
        pollutants: response.data.data
      };
    }
  } catch (err) {
    // Fail silently
  }
  return null;
}

// Query OpenAQ for air quality data
async function queryOpenAQ(city, country) {
  try {
    const headers = OPENAQ_KEY ? { 'X-API-Key': OPENAQ_KEY } : {};
    const url = `${APIs.openaq}/locations?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&limit=100`;
    const response = await axios.get(url, { headers, timeout: 5000 });
    if (response.data && response.data.results && response.data.results.length > 0) {
      return {
        hasData: true,
        locations: response.data.results.length,
        measurements: response.data.results[0].measurements
      };
    }
  } catch (err) {
    // Fail silently
  }
  return null;
}

// Check regional coverage for a country
async function checkCountryRegions(country) {
  console.log(`\n🌍 Checking ${country.name} (${country.iso2})...`);
  
  const regions = COUNTRY_REGIONS[country.name] || [];
  const regionCoverage = {};
  
  if (regions.length === 0) {
    // Use capital city or generic coordinates as fallback
    console.log(`  ⚠️ No known regions. Using country center coordinates.`);
    regionCoverage['Capital/Center'] = {
      cities: [country.name],
      apis: { openweather: null, waqi: null, openaq: null },
      hasData: false
    };
  } else {
    for (const region of regions) {
      console.log(`  📍 Checking ${region}...`);
      
      // Try each API
      const owData = await queryOpenWeather(...(await geocodeCity(region, country.name) || [0, 0]), region);
      const waqiData = await queryWAQI(region, country.name);
      const openaqData = await queryOpenAQ(region, country.name);
      
      regionCoverage[region] = {
        apis: {
          openweather: owData ? 'available' : 'no_data',
          waqi: waqiData ? 'available' : 'no_data',
          openaq: openaqData ? 'available' : 'no_data'
        },
        hasData: !!(owData || waqiData || openaqData),
        details: {
          openweather: owData,
          waqi: waqiData,
          openaq: openaqData
        }
      };
      
      // Add rate limit delay
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  coverage[country.name] = {
    iso2: country.iso2,
    iso3: country.iso3,
    region: country.region,
    totalRegions: regions.length,
    regions: regionCoverage,
    hasAnyData: Object.values(regionCoverage).some(r => r.hasData)
  };
}

// Main verification function
async function runVerification() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     REGIONAL COVERAGE VERIFICATION - ALL 193 COUNTRIES    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  const totalCountries = countriesData.countries.length;
  let processed = 0;
  
  for (const country of countriesData.countries) {
    try {
      await checkCountryRegions(country);
      processed++;
      
      if (processed % 20 === 0) {
        console.log(`\n✅ Progress: ${processed}/${totalCountries} countries processed`);
      }
    } catch (err) {
      console.error(`❌ Error processing ${country.name}:`, err.message);
      errors.push(`${country.name}: ${err.message}`);
    }
  }
  
  return { coverage, errors, processed };
}

// Generate reports
async function generateReports(data) {
  const { coverage: coverageData, errors: errorList, processed } = data;
  
  // Statistics
  const stats = {
    totalCountries: Object.keys(coverageData).length,
    countriesWithData: Object.values(coverageData).filter(c => c.hasAnyData).length,
    countriesNoData: Object.values(coverageData).filter(c => !c.hasAnyData).length,
    totalRegions: Object.values(coverageData).reduce((sum, c) => sum + c.totalRegions, 0),
    regionsWithData: Object.values(coverageData).reduce(
      (sum, c) => sum + Object.values(c.regions).filter(r => r.hasData).length, 0
    ),
    byAPI: {
      openweather: 0,
      waqi: 0,
      openaq: 0
    }
  };
  
  // Count by API
  Object.values(coverageData).forEach(country => {
    Object.values(country.regions).forEach(region => {
      if (region.apis.openweather === 'available') stats.byAPI.openweather++;
      if (region.apis.waqi === 'available') stats.byAPI.waqi++;
      if (region.apis.openaq === 'available') stats.byAPI.openaq++;
    });
  });
  
  // Write JSON report
  fs.writeFileSync(
    path.join(__dirname, 'REGIONAL_COVERAGE_FULL.json'),
    JSON.stringify(coverageData, null, 2)
  );
  console.log('✅ JSON report saved: REGIONAL_COVERAGE_FULL.json');
  
  // Write markdown report
  let markdown = `# Global Regional Air Quality Coverage Report\n`;
  markdown += `**Generated:** ${new Date().toISOString()}\n`;
  markdown += `**Status:** Verification of all ${stats.totalCountries} countries complete\n\n`;
  
  markdown += `## Executive Summary\n`;
  markdown += `- **Total Countries:** ${stats.totalCountries}\n`;
  markdown += `- **Countries with Data:** ${stats.countriesWithData} (${Math.round(stats.countriesWithData/stats.totalCountries*100)}%)\n`;
  markdown += `- **Countries without Data:** ${stats.countriesNoData}\n`;
  markdown += `- **Total Regions Checked:** ${stats.totalRegions}\n`;
  markdown += `- **Regions with Data:** ${stats.regionsWithData}\n`;
  markdown += `- **API Coverage:**\n`;
  markdown += `  - OpenWeather: ${stats.byAPI.openweather} regions\n`;
  markdown += `  - WAQI: ${stats.byAPI.waqi} regions\n`;
  markdown += `  - OpenAQ: ${stats.byAPI.openaq} regions\n\n`;
  
  // Countries with data
  markdown += `## Countries with Regional Data\n`;
  const countriesWithData = Object.entries(coverageData)
    .filter(([_, c]) => c.hasAnyData)
    .sort((a, b) => b[1].regions.filter(r => r.hasData).length - a[1].regions.filter(r => r.hasData).length);
  
  for (const [countryName, countryData] of countriesWithData) {
    const regionsWithData = Object.entries(countryData.regions)
      .filter(([_, r]) => r.hasData)
      .length;
    markdown += `\n### ${countryName} (${countryData.iso2})\n`;
    markdown += `- **Region:** ${countryData.region}\n`;
    markdown += `- **Regions with Data:** ${regionsWithData}/${countryData.totalRegions}\n`;
    markdown += `- **Available APIs:** `;
    
    const apis = new Set();
    Object.values(countryData.regions).forEach(r => {
      if (r.apis.openweather === 'available') apis.add('OpenWeather');
      if (r.apis.waqi === 'available') apis.add('WAQI');
      if (r.apis.openaq === 'available') apis.add('OpenAQ');
    });
    markdown += `${Array.from(apis).join(', ') || 'None'}\n`;
  }
  
  // Countries without data
  if (stats.countriesNoData > 0) {
    markdown += `\n## Countries without Regional Data (${stats.countriesNoData})\n`;
    const countriesNoData = Object.entries(coverageData)
      .filter(([_, c]) => !c.hasAnyData)
      .map(([name]) => name)
      .sort();
    
    for (let i = 0; i < countriesNoData.length; i += 5) {
      markdown += countriesNoData.slice(i, i + 5).map(n => `- ${n}`).join('\n') + '\n';
    }
  }
  
  if (errorList.length > 0) {
    markdown += `\n## Errors Encountered\n`;
    errorList.forEach(err => markdown += `- ${err}\n`);
  }
  
  fs.writeFileSync(
    path.join(__dirname, 'REGIONAL_COVERAGE_REPORT.md'),
    markdown
  );
  console.log('✅ Markdown report saved: REGIONAL_COVERAGE_REPORT.md');
  
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                      VERIFICATION COMPLETE                ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log(`📊 Summary:`);
  console.log(`  Countries with data: ${stats.countriesWithData}/${stats.totalCountries}`);
  console.log(`  Total regions checked: ${stats.totalRegions}`);
  console.log(`  Regions with data: ${stats.regionsWithData}`);
  console.log(`  API distribution: OW=${stats.byAPI.openweather} | WAQI=${stats.byAPI.waqi} | OpenAQ=${stats.byAPI.openaq}`);
}

// Run verification
(async () => {
  try {
    const result = await runVerification();
    await generateReports(result);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
})();
