const http = require('http');
const tests = [
  {city:'USA'},
  {city:'Tamil Nadu'},
  {city:'California'},
  {city:'Texas'},
  {city:'India'},
  {city:'Germany'},
  {city:'United Kingdom'},
  {city:'Salem'},
];

let pending = tests.length;
const results = [];

tests.forEach(t => {
  const body = JSON.stringify(t);
  const req = http.request({
    hostname: 'localhost', port: 5000,
    path: '/api/hybrid-measurements', method: 'POST',
    headers: {'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}
  }, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      try {
        const j = JSON.parse(d);
        results.push({
          query: t.city,
          resolvedLocation: j.resolvedLocation,
          level: j.searchContext?.level,
          stations: j.stations?.length || 0,
          results: j.results?.length || 0,
          pass: j.searchContext?.level !== 'city' || (j.results?.length > 5)
        });
      } catch(e) {
        results.push({query: t.city, error: e.message});
      }
      pending--;
      if (pending === 0) {
        console.log('\n=== VALIDATION RESULTS ===');
        results.forEach(r => {
          const icon = r.error ? '❌' : (r.pass ? '✅' : '⚠️');
          console.log(`${icon} [${(r.level||'?').toUpperCase()}] ${r.query} → ${r.resolvedLocation || r.error} (${r.stations} stations, ${r.results} results)`);
        });
        console.log('\n=== SUMMARY ===');
        const pass = results.filter(r => r.pass && !r.error).length;
        console.log(`${pass}/${results.length} queries resolved correctly`);
        process.exit(0);
      }
    });
  });
  req.on('error', e => {
    results.push({query: t.city, error: e.message});
    pending--;
    if (pending === 0) {
      results.forEach(r => console.log(JSON.stringify(r)));
      process.exit(0);
    }
  });
  req.write(body);
  req.end();
});
