// Comprehensive Data Collection Verification Script
// Checks if automatic data collection works with the new table structure

const { Pool } = require('pg');
const axios = require('axios');
require('dotenv').config();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Target cities for data collection
const TARGET_CITIES = ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata', 'Hyderabad'];

async function checkDataCollectionSystem() {
    console.log("🔍 AUTOMATIC DATA COLLECTION SYSTEM VERIFICATION");
    console.log("=" .repeat(70));
    console.log("📊 New Table Structure: air_quality_data");
    console.log("🎯 Target Cities: " + TARGET_CITIES.join(', '));
    console.log("=" .repeat(70));

    try {
        const client = await pool.connect();

        // 1. Check if the new table exists and its structure
        console.log("\n1️⃣ CHECKING TABLE STRUCTURE:");
        console.log("-".repeat(50));
        
        const tableCheckQuery = `
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'air_quality_data' 
            ORDER BY ordinal_position
        `;
        
        const tableResult = await client.query(tableCheckQuery);
        
        if (tableResult.rows.length === 0) {
            console.log("❌ Table 'air_quality_data' not found!");
            console.log("🔧 Creating the table now...");
            
            const createTableQuery = `
                CREATE TABLE air_quality_data (
                    id SERIAL PRIMARY KEY,
                    city VARCHAR(100),
                    country VARCHAR(100),
                    latitude DECIMAL(9,6),
                    longitude DECIMAL(9,6),
                    aqi INTEGER,
                    pm25 DECIMAL(10,2),
                    pm10 DECIMAL(10,2),
                    no2 DECIMAL(10,2),
                    so2 DECIMAL(10,2),
                    co DECIMAL(10,2),
                    o3 DECIMAL(10,2),
                    temperature DECIMAL(5,2),
                    humidity DECIMAL(5,2),
                    data_source VARCHAR(50),
                    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `;
            
            await client.query(createTableQuery);
            console.log("✅ Table created successfully!");
        } else {
            console.log("✅ Table 'air_quality_data' found!");
            console.log("📋 Table Structure:");
            tableResult.rows.forEach(row => {
                console.log(`   ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? '(NOT NULL)' : '(NULLABLE)'}`);
            });
        }

        // 2. Check existing data in the new table
        console.log("\n2️⃣ CHECKING EXISTING DATA:");
        console.log("-".repeat(50));
        
        const dataCountQuery = `
            SELECT 
                city,
                COUNT(*) as record_count,
                MAX(recorded_at) as latest_record,
                MIN(recorded_at) as earliest_record,
                COUNT(CASE WHEN pm25 IS NOT NULL THEN 1 END) as pm25_count,
                COUNT(CASE WHEN pm10 IS NOT NULL THEN 1 END) as pm10_count,
                COUNT(CASE WHEN no2 IS NOT NULL THEN 1 END) as no2_count,
                COUNT(CASE WHEN aqi IS NOT NULL THEN 1 END) as aqi_count
            FROM air_quality_data 
            GROUP BY city 
            ORDER BY record_count DESC
        `;
        
        const dataResult = await client.query(dataCountQuery);
        
        if (dataResult.rows.length === 0) {
            console.log("⚠️  No data found in the table!");
            console.log("🔄 This suggests data collection may not be running or data is going to old table");
        } else {
            console.log("📊 Current Data Summary:");
            dataResult.rows.forEach(row => {
                console.log(`   ${row.city}: ${row.record_count} records (Latest: ${row.latest_record?.toISOString().split('T')[0] || 'N/A'})`);
                console.log(`      PM2.5: ${row.pm25_count}/${row.record_count}, PM10: ${row.pm10_count}/${row.record_count}, AQI: ${row.aqi_count}/${row.record_count}`);
            });
        }

        // 3. Test the data collection function manually
        console.log("\n3️⃣ TESTING DATA COLLECTION FUNCTION:");
        console.log("-".repeat(50));
        
        try {
            // Test API endpoints for data collection
            const testCity = 'Delhi';
            console.log(`🧪 Testing data collection for ${testCity}...`);
            
            // Check if OpenAQ API is accessible
            const openaqTest = await axios.get('https://api.openaq.org/v3/locations?limit=1&city=' + testCity, {
                headers: { 'X-API-Key': process.env.OPENAQ_API_KEY },
                timeout: 10000
            });
            
            if (openaqTest.data && openaqTest.data.results) {
                console.log("✅ OpenAQ API accessible");
                
                // Simulate data collection insertion
                const sampleData = {
                    city: testCity,
                    country: 'India',
                    latitude: 28.7041,
                    longitude: 77.1025,
                    aqi: Math.floor(Math.random() * 200) + 50,
                    pm25: (Math.random() * 100 + 20).toFixed(2),
                    pm10: (Math.random() * 150 + 30).toFixed(2),
                    no2: (Math.random() * 50 + 10).toFixed(2),
                    so2: (Math.random() * 30 + 5).toFixed(2),
                    co: (Math.random() * 5 + 1).toFixed(2),
                    o3: (Math.random() * 80 + 20).toFixed(2),
                    temperature: (Math.random() * 15 + 20).toFixed(2),
                    humidity: (Math.random() * 40 + 40).toFixed(2),
                    data_source: 'Test Collection'
                };
                
                const insertQuery = `
                    INSERT INTO air_quality_data 
                    (city, country, latitude, longitude, aqi, pm25, pm10, no2, so2, co, o3, temperature, humidity, data_source)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                    RETURNING id, recorded_at
                `;
                
                const insertResult = await client.query(insertQuery, [
                    sampleData.city, sampleData.country, sampleData.latitude, sampleData.longitude,
                    sampleData.aqi, sampleData.pm25, sampleData.pm10, sampleData.no2,
                    sampleData.so2, sampleData.co, sampleData.o3, sampleData.temperature,
                    sampleData.humidity, sampleData.data_source
                ]);
                
                console.log(`✅ Test data inserted successfully! ID: ${insertResult.rows[0].id}, Time: ${insertResult.rows[0].recorded_at}`);
                
            } else {
                console.log("⚠️  OpenAQ API test failed - no data returned");
            }
            
        } catch (apiError) {
            console.log("⚠️  API test failed:", apiError.message);
            console.log("💡 This could be due to API limits or connectivity issues");
        }

        // 4. Check if automatic collection is configured
        console.log("\n4️⃣ CHECKING AUTOMATIC COLLECTION CONFIGURATION:");
        console.log("-".repeat(50));
        
        // Check if collect.js exists and is properly configured
        const fs = require('fs');
        const collectFilePath = './collect.js';
        
        if (fs.existsSync(collectFilePath)) {
            console.log("✅ collect.js file found");
            
            // Read and analyze collect.js
            const collectContent = fs.readFileSync(collectFilePath, 'utf8');
            
            // Check if it's using the new table structure
            if (collectContent.includes('air_quality_data')) {
                console.log("✅ collect.js is configured for new table structure");
            } else {
                console.log("⚠️  collect.js might be using old table structure");
                console.log("🔧 Need to update collect.js to use 'air_quality_data' table");
            }
            
            // Check for required fields
            const requiredFields = ['pm25', 'pm10', 'no2', 'so2', 'co', 'o3', 'aqi'];
            const missingFields = requiredFields.filter(field => !collectContent.includes(field));
            
            if (missingFields.length === 0) {
                console.log("✅ All required pollutant fields are handled");
            } else {
                console.log("⚠️  Missing fields in collect.js:", missingFields.join(', '));
            }
            
        } else {
            console.log("❌ collect.js file not found!");
            console.log("🔧 Data collection script needs to be created");
        }

        // 5. Check GitHub Actions workflow
        console.log("\n5️⃣ CHECKING GITHUB ACTIONS WORKFLOW:");
        console.log("-".repeat(50));
        
        const workflowPath = './.github/workflows';
        if (fs.existsSync(workflowPath)) {
            const workflowFiles = fs.readdirSync(workflowPath);
            if (workflowFiles.length > 0) {
                console.log("✅ GitHub Actions workflows found:", workflowFiles.join(', '));
            } else {
                console.log("⚠️  No GitHub Actions workflows found");
            }
        } else {
            console.log("❌ GitHub Actions workflow directory not found");
        }

        // 6. Recommendations
        console.log("\n6️⃣ RECOMMENDATIONS:");
        console.log("-".repeat(50));
        
        const recommendations = [];
        
        if (dataResult.rows.length === 0) {
            recommendations.push("🔧 Update data collection script to use new table structure");
            recommendations.push("🔄 Restart automatic data collection process");
        }
        
        if (dataResult.rows.length > 0) {
            const latestRecord = Math.max(...dataResult.rows.map(r => new Date(r.latest_record)));
            const hoursAgo = (Date.now() - latestRecord) / (1000 * 60 * 60);
            
            if (hoursAgo > 2) {
                recommendations.push("⏰ Latest data is " + Math.floor(hoursAgo) + " hours old - check if collection is running");
            }
        }
        
        const missingCities = TARGET_CITIES.filter(city => 
            !dataResult.rows.some(row => row.city.toLowerCase().includes(city.toLowerCase()))
        );
        
        if (missingCities.length > 0) {
            recommendations.push("🏙️ Missing data for cities: " + missingCities.join(', '));
        }
        
        if (recommendations.length === 0) {
            console.log("🎉 All systems appear to be working correctly!");
        } else {
            recommendations.forEach(rec => console.log(rec));
        }

        client.release();

        console.log("\n" + "=" .repeat(70));
        console.log("🎯 DATA COLLECTION SYSTEM VERIFICATION COMPLETE");
        console.log("=" .repeat(70));

        return true;

    } catch (error) {
        console.error("❌ Verification failed:", error.message);
        return false;
    }
}

// Run the verification
if (require.main === module) {
    checkDataCollectionSystem()
        .then(success => {
            if (success) {
                console.log("\n✅ Verification completed!");
                process.exit(0);
            } else {
                console.log("\n❌ Verification failed!");
                process.exit(1);
            }
        })
        .catch(error => {
            console.error("❌ Script error:", error);
            process.exit(1);
        });
}

module.exports = { checkDataCollectionSystem };