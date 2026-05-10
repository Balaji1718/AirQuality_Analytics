const axios = require('axios');
const fs = require('fs');
const countriesData = require('./countries_193.json');

const SERVER_URL = 'http://localhost:5000';
const SAMPLE_SIZE = 50; // Test 50 representative countries to avoid rate limiting

// Representative sample from each region
const REPRESENTATIVE_COUNTRIES = [
  // Asia
  'India', 'China', 'Japan', 'South Korea', 'Pakistan', 'Bangladesh', 
  'Indonesia', 'Thailand', 'Vietnam', 'Philippines', 'Malaysia', 'Singapore',
  'Hong Kong', 'Taiwan', 'Iran', 'Iraq', 'Saudi Arabia', 'United Arab Emirates',
  'Israel', 'Turkey', 'Nepal', 'Sri Lanka',
  // Europe
  'United Kingdom', 'Germany', 'France', 'Italy', 'Spain', 'Poland',
  'Netherlands', 'Belgium', 'Switzerland', 'Austria', 'Sweden', 'Norway',
  'Denmark', 'Russia', 'Ukraine', 'Romania', 'Greece',
  // Americas
  'United States', 'Canada', 'Mexico', 'Brazil', 'Chile', 'Argentina',
  'Colombia', 'Peru', 'Venezuela', 'Australia',
  // Africa
  'Egypt', 'South Africa', 'Nigeria', 'Kenya', 'Ethiopia', 'Morocco',
  // Middle East
  'Qatar', 'Kuwait', 'United Arab Emirates'
];

const coverage = {
  supported: [],
  partial: [],
  unsupported: [],
  errors: []
};

async function testCountry(countryName) {
  try {
    const response = await axios.post(
      `${SERVER_URL}/api/hybrid-measurements`,
      { city: countryName },
      { timeout: 10000, validateStatus: () => true }
    );
    
    const data = response.data;
    
    if (data.empty === true) {
      return {
        country: countryName,
        status: 'partial',
        message: data.message || 'No current data available',
        resolved: data.resolvedLocation,
        searchContext: data.searchContext,
        sources: data.attemptedSources || []
      };
    } else if (data.count > 0 || (data.measurements && data.measurements.length > 0)) {
      return {
        country: countryName,
        status: 'supported',
        count: data.count,
        resolved: data.resolvedLocation,
        searchContext: data.searchContext,
        source: data.source,
        stations: data.stations ? data.stations.length : 0
      };
    } else {
      return {
        country: countryName,
        status: 'unsupported',
        message: data.message || 'No data found'
      };
    }
  } catch (error) {
    return {
      country: countryName,
      status: 'error',
      error: error.message
    };
  }
}

async function runVerification() {
  console.log(`\n🌍 Backend Coverage Verification (Sample: ${REPRESENTATIVE_COUNTRIES.length} countries)\n`);
  console.log(`📍 Testing against: ${SERVER_URL}\n`);
  
  let tested = 0;
  
  for (const country of REPRESENTATIVE_COUNTRIES) {
    process.stdout.write(`\r⏳ Progress: ${tested}/${REPRESENTATIVE_COUNTRIES.length}`);
    
    const result = await testCountry(country);
    
    if (result.status === 'supported') {
      coverage.supported.push(result);
    } else if (result.status === 'partial') {
      coverage.partial.push(result);
    } else if (result.status === 'error') {
      coverage.errors.push(result);
    } else {
      coverage.unsupported.push(result);
    }
    
    tested++;
    
    // Rate limiting - be gentle with APIs
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  console.log('\n');
  generateReport();
}

function generateReport() {
  console.log('\n✅ Verification Complete!\n');
  
  let report = `# Backend Coverage Verification Report
**Generated:** ${new Date().toISOString()}
**Server:** ${SERVER_URL}
**Sample Size:** ${REPRESENTATIVE_COUNTRIES.length} countries tested

## Summary Statistics
- **Fully Supported:** ${coverage.supported.length} (${Math.round(coverage.supported.length/REPRESENTATIVE_COUNTRIES.length*100)}%)
- **Partial Coverage:** ${coverage.partial.length} (${Math.round(coverage.partial.length/REPRESENTATIVE_COUNTRIES.length*100)}%)
- **Unsupported:** ${coverage.unsupported.length} (${Math.round(coverage.unsupported.length/REPRESENTATIVE_COUNTRIES.length*100)}%)
- **Errors:** ${coverage.errors.length}

## Supported Countries (Full Data Available)
${coverage.supported.map(c => 
  `- **${c.country}** | Resolved: ${c.resolved} | Count: ${c.count} | Stations: ${c.stations} | Source: ${c.source}`
).join('\n')}

## Partial Coverage Countries (Empty State)
${coverage.partial.map(c => 
  `- **${c.country}** | Resolved: ${c.resolved} | Message: ${c.message}`
).join('\n')}

## Unsupported Countries (No Data)
${coverage.unsupported.map(c => 
  `- **${c.country}** | Message: ${c.message}`
).join('\n')}

## Error Summary
${coverage.errors.length > 0 ? coverage.errors.map(c => 
  `- **${c.country}** | Error: ${c.error}`
).join('\n') : 'No errors'}

## Coverage Map
\`\`\`json
{
  "total_tested": ${REPRESENTATIVE_COUNTRIES.length},
  "supported": ${coverage.supported.length},
  "partial": ${coverage.partial.length},
  "unsupported": ${coverage.unsupported.length},
  "errors": ${coverage.errors.length}
}
\`\`\`

## Supported Countries Detail
${JSON.stringify(coverage.supported, null, 2)}

## Partial Coverage Countries Detail
${JSON.stringify(coverage.partial, null, 2)}

## Recommendations
1. **High Priority:** Countries with "partial" status need better fallback location selection or regional data
2. **Medium Priority:** Consider expanding OpenAQ/WAQI city coverage for unsupported countries
3. **UI Enhancement:** Implement graceful empty-state with suggestions for nearby supported countries
4. **Data Freshness:** For supported countries, consider caching recent queries to improve response time
`;

  fs.writeFileSync('./BACKEND_COVERAGE_REPORT.md', report);
  console.log('📊 Report saved to: BACKEND_COVERAGE_REPORT.md\n');
  
  // Save JSON for programmatic access
  fs.writeFileSync('./backend_coverage.json', JSON.stringify(coverage, null, 2));
  console.log('📊 Data saved to: backend_coverage.json\n');
  
  // Print console summary
  console.log('📈 COVERAGE SUMMARY:');
  console.log(`  ✅ Fully Supported:   ${coverage.supported.length}/${REPRESENTATIVE_COUNTRIES.length}`);
  console.log(`  ⚠️  Partial Coverage:  ${coverage.partial.length}/${REPRESENTATIVE_COUNTRIES.length}`);
  console.log(`  ❌ Unsupported:       ${coverage.unsupported.length}/${REPRESENTATIVE_COUNTRIES.length}`);
  console.log(`  ⚡ Errors:           ${coverage.errors.length}/${REPRESENTATIVE_COUNTRIES.length}\n`);
  
  if (coverage.supported.length > 0) {
    console.log('✅ FULLY SUPPORTED COUNTRIES:');
    coverage.supported.slice(0, 10).forEach(c => 
      console.log(`  - ${c.country} (${c.count} records from ${c.source})`)
    );
    if (coverage.supported.length > 10) {
      console.log(`  ... and ${coverage.supported.length - 10} more`);
    }
    console.log();
  }
  
  if (coverage.partial.length > 0) {
    console.log('⚠️  PARTIAL COVERAGE (Empty State):');
    coverage.partial.slice(0, 10).forEach(c => 
      console.log(`  - ${c.country}: ${c.message}`)
    );
    if (coverage.partial.length > 10) {
      console.log(`  ... and ${coverage.partial.length - 10} more`);
    }
    console.log();
  }
}

runVerification().catch(err => {
  console.error('Verification failed:', err.message);
  process.exit(1);
});
