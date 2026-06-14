import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const clientAppPath = path.join(__dirname, '../client/src/App.js');
let content = fs.readFileSync(clientAppPath, 'utf8');

const target1 = `  // Dynamic snapshot that updates based on current data and filters
  const snapshotSeries = data ? (() => {
    // Use the current measurements data to generate fresh snapshot
    const currentData = data.results || data.measurements || [];
    if (currentData.length === 0) return data.snapshot || [];
    
    // Recalculate snapshot from current filtered data
    const dynamicSnapshot = groupSnapshot(currentData);
    console.log("Dynamic snapshot calculated:", { 
      originalSnapshot: data.snapshot?.length || 0, 
      dynamicSnapshot: dynamicSnapshot.length,
      sourceData: currentData.length 
    });
    
    return dynamicSnapshot;
  })() : [];`;

const replacement1 = `  // Dynamic snapshot that updates based on current data and filters
  const snapshotSeries = data ? (() => {
    // Use the current measurements data to generate fresh snapshot
    let currentData = data.results || data.measurements || [];
    
    // Filter to primary station if search level is city/locality/station to prevent station averaging
    if (data.searchContext?.level !== 'country' && data.searchContext?.level !== 'region') {
      const primaryStationName = data.providerLocation || data.resolvedLocation;
      if (primaryStationName) {
        currentData = currentData.filter(r => 
          r.providerLocation === primaryStationName || 
          r.location === primaryStationName ||
          r.stationMetadata?.stationName === primaryStationName
        );
      }
    }

    if (currentData.length === 0) return data.snapshot || [];
    
    // Recalculate snapshot from current filtered data
    const dynamicSnapshot = groupSnapshot(currentData);
    console.log("Dynamic snapshot calculated:", { 
      originalSnapshot: data.snapshot?.length || 0, 
      dynamicSnapshot: dynamicSnapshot.length,
      sourceData: currentData.length 
    });
    
    return dynamicSnapshot;
  })() : [];`;

const target2 = `  const timeSeries = data ? (() => {
    // Determine bucket type based on filter granularity
    let bucketType = "hour"; // default
    if (fromYear || toYear) {
      if (fromMonth || toMonth) {
        if (fromDay || toDay) {
          bucketType = "hour"; // Year+Month+Day = hourly view
        } else {
          bucketType = "day"; // Year+Month = daily view
        }
      } else {
        bucketType = "month"; // Year only = monthly view
      }
    }
    
    // Use data.results for chart data (now properly available)
    const resultsData = data.results || data.measurements || [];
    const buckets = bucketBy(resultsData, bucketType);
    
    console.log("Chart data processed:", { 
      buckets: buckets.length, 
      bucketType, 
      filters: { fromYear, toYear, fromMonth, toMonth, fromDay, toDay, fromHour, toHour },
      rawResults: resultsData.length
    });
    
    return buckets;
  })() : [];`;

const replacement2 = `  const timeSeries = data ? (() => {
    // Determine bucket type based on filter granularity
    let bucketType = "hour"; // default
    if (fromYear || toYear) {
      if (fromMonth || toMonth) {
        if (fromDay || toDay) {
          bucketType = "hour"; // Year+Month+Day = hourly view
        } else {
          bucketType = "day"; // Year+Month = daily view
        }
      } else {
        bucketType = "month"; // Year only = monthly view
      }
    }
    
    // Use data.results for chart data (now properly available)
    let resultsData = data.results || data.measurements || [];
    
    // Filter to primary station if search level is city/locality/station to prevent station averaging
    if (data.searchContext?.level !== 'country' && data.searchContext?.level !== 'region') {
      const primaryStationName = data.providerLocation || data.resolvedLocation;
      if (primaryStationName) {
        resultsData = resultsData.filter(r => 
          r.providerLocation === primaryStationName || 
          r.location === primaryStationName ||
          r.stationMetadata?.stationName === primaryStationName
        );
      }
    }

    const buckets = bucketBy(resultsData, bucketType);
    
    console.log("Chart data processed:", { 
      buckets: buckets.length, 
      bucketType, 
      filters: { fromYear, toYear, fromMonth, toMonth, fromDay, toDay, fromHour, toHour },
      rawResults: resultsData.length
    });
    
    return buckets;
  })() : [];`;

// Normalize line endings to LF before replacing, then write back with normal file endings
const normContent = content.replace(/\r\n/g, '\n');
const normTarget1 = target1.replace(/\r\n/g, '\n');
const normReplacement1 = replacement1.replace(/\r\n/g, '\n');
const normTarget2 = target2.replace(/\r\n/g, '\n');
const normReplacement2 = replacement2.replace(/\r\n/g, '\n');

if (!normContent.includes(normTarget1)) {
  console.error('Error: Could not find target 1 in App.js');
  process.exit(1);
}
if (!normContent.includes(normTarget2)) {
  console.error('Error: Could not find target 2 in App.js');
  process.exit(1);
}

const newContent = normContent
  .replace(normTarget1, normReplacement1)
  .replace(normTarget2, normReplacement2);

fs.writeFileSync(clientAppPath, newContent, 'utf8');
console.log('Successfully patched client App.js!');
