const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'server/index.js');
let content = fs.readFileSync(filePath, 'utf8');

const oldStr = `async function fetchFromWAQI(cityName) {
  const { validateLocationMatch, getStandardCoordinates } = require('./utils/locationValidator');
  
  try {
    // Get validated coordinates for the city
    const standardCoords = getStandardCoordinates(cityName);
    let url;
    
    if (standardCoords) {
      // Use validated coordinates for geo-based search
      url = \`\${API_SOURCES.waqi.baseUrl}/feed/geo:\${standardCoords.lat};\${standardCoords.lon}/?token=\${API_SOURCES.waqi.token}\`;
      console.log(\`🎯 Using validated coordinates for \${cityName}: \${standardCoords.lat}, \${standardCoords.lon}\`);
    } else {
      // Fallback to city search for non-Indian cities
      url = \`\${API_SOURCES.waqi.baseUrl}/feed/\${encodeURIComponent(cityName)}/?token=\${API_SOURCES.waqi.token}\`;
      console.log(\`🔍 Using city search for \${cityName}\`);
    }
    
    const response = await axios.get(url);
    
    if (response.data && response.data.status === "ok" && response.data.data) {
      const data = response.data.data;
      
      // Validate location match before processing data
      const locationValidation = validateLocationMatch(`;

const newStr = `async function fetchFromWAQI(cityName) {
  const { validateLocationMatch } = require('./utils/locationValidator');
  
  try {
    // PRIORITIZE KEYWORD SEARCH: Allows WAQI to return the most relevant station or multiple results
    // instead of forcing a single nearest station to a city center coordinate.
    const url = \`\${API_SOURCES.waqi.baseUrl}/feed/\${encodeURIComponent(cityName)}/?token=\${API_SOURCES.waqi.token}\`;
    console.log(\`🔍 Using WAQI keyword search for \${cityName}\`);
    
    const response = await axios.get(url);
    
    if (response.data && response.data.status === "ok" && response.data.data) {
      const data = response.data.data;
      
      // Validate location match before processing data
      const locationValidation = validateLocationMatch(`;

function tryReplace(content, oldS, newS) {
    if (content.includes(oldS)) {
        return content.replace(oldS, newS);
    }
    // Try normalizing line endings to LF
    const normContent = content.replace(/\r\n/g, '\n');
    const normOldS = oldS.replace(/\r\n/g, '\n');
    const normNewS = newS.replace(/\r\n/g, '\n');
    
    if (normContent.includes(normOldS)) {
        console.log('Found match with normalized line endings');
        return normContent.replace(normOldS, normNewS);
    }
    return null;
}

const updatedContent = tryReplace(content, oldStr, newStr);

if (updatedContent) {
    fs.writeFileSync(filePath, updatedContent);
    console.log('Successfully refactored fetchFromWAQI');
} else {
    console.error('Could not find the target string in server/index.js');
    process.exit(1);
}
