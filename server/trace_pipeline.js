const axios = require('axios');

async function traceCity(city) {
  console.log('\n======================================================');
  console.log('TRACE REPORT FOR: ' + city);
  console.log('======================================================\n');

  try {
    const payload = { city };
    const response = await axios.post('http://localhost:5000/api/hybrid-measurements', payload);
    const data = response.data;
    
    console.log('1. API RESPONSE INFO:');
    console.log('   - Station Count: ' + (data.apiInfo?.stationCount || 'N/A'));
    console.log('   - Primary Station: ' + data.resolvedLocation);
    
    console.log('\n2. STATIONS ARRAY:');
    if (data.stations && data.stations.length > 0) {
      data.stations.forEach((s, idx) => {
        console.log('   Station ' + (idx + 1) + ': ' + s.resolvedLocation);
        console.log('     - AQI Snapshot: ' + JSON.stringify(s.snapshot));
        console.log('     - Coordinates: ' + JSON.stringify(s.coordinates));
      });
    } else {
      console.log('   (stations array empty or missing)');
    }
    
    console.log('\n3. LEGACY FIELDS CHECK:');
    console.log('   - snapshot: ' + JSON.stringify(data.snapshot));
    
  } catch (error) {
    console.log('\nERROR:', error.message);
    if (error.response) console.log(JSON.stringify(error.response.data, null, 2));
  }
}

async function run() {
  await traceCity('Delhi');
  await traceCity('Chennai');
}

run();
