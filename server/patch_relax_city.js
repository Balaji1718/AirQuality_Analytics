const fs = require('fs');
const p = 'server/index.js';
let s = fs.readFileSync(p, 'utf8');

const oldCheck = 'const cityName = (body.city || "").trim();\n    if (!cityName) return res.status(400).json({ error: "city is required" });';
const replacementCheck = `const cityName = (body.city || "").trim();
    const country = (body.country || "").trim();
    const state = (body.state || "").trim();
    if (!cityName && !country) return res.status(400).json({ error: "city or country is required" });`;

s = s.split(oldCheck).join(replacementCheck);

s = s.split('const cacheKey = `measurements_v2_${cityName}_${JSON.stringify(body)}`;').join('const cacheKeyBase = cityName || (state ? state + "," + country : country);\n    const cacheKey = `measurements_v2_${cacheKeyBase}_${JSON.stringify(body)}`;');

s = s.split('const cacheKey = `measurements_${cityName}_${JSON.stringify(body)}`;').join('const cacheKeyBase = cityName || (state ? state + "," + country : country);\n    const cacheKey = `measurements_${cacheKeyBase}_${JSON.stringify(body)}`;');

fs.writeFileSync(p, s, 'utf8');
console.log('PATCHED server/index.js');
