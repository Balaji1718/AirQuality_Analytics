# Automated Air Quality Data Collection

This system automatically collects air quality data for 6 Indian cities every hour using GitHub Actions and stores it in your Neon PostgreSQL database.

## 🎯 Overview

- **Schedule**: Every hour at minute 0 (`:00`)
- **Cities**: Chennai, Delhi, Bengaluru, Hyderabad, Mumbai, Kolkata  
- **Data Sources**: World Air Quality Index (WAQI) API with OpenWeatherMap fallback
- **Database**: Neon PostgreSQL
- **Language**: Node.js only (no Python required)

## 🚀 How It Works

1. **GitHub Actions** triggers `auto-collect.yml` workflow every hour
2. **Collection Script** (`scripts/collect_data.js`) runs automatically
3. **Data Collection**: Fetches pollutant data from APIs with retry logic
4. **Database Storage**: Inserts new records with duplicate prevention
5. **Verification**: Confirms successful insertion with detailed logging

## 📁 Project Structure

```
AirQuality_Analytics/
├── .github/workflows/
│   └── auto-collect.yml          # GitHub Actions workflow
├── scripts/
│   ├── collect_data.js           # Main collection script
│   ├── package.json              # Node.js dependencies
│   └── .env.example              # Environment variables template
└── server/                       # Your existing Express app
    └── .env                      # Local environment variables
```

## 🔧 Setup Instructions

### 1. GitHub Secrets Configuration

Set these secrets in your GitHub repository (`Settings > Secrets and variables > Actions`):

**Required:**
- `DATABASE_URL`: Your Neon PostgreSQL connection string
  ```
  postgresql://username:password@host:5432/database
  ```

**Optional (improves data quality):**
- `WAQI_TOKEN`: World Air Quality Index API token
- `OPENWEATHER_API_KEY`: OpenWeatherMap API key

### 2. Local Development Setup

```bash
cd AirQuality_Analytics/scripts
npm install
cp .env.example .env
# Edit .env with your actual values
node collect_data.js  # Test locally
```

## 📊 Database Schema

The script uses your existing `air_quality_data` table:

```sql
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
    recorded_at TIMESTAMP
);
```

## 🕐 Scheduling Details

- **Cron**: `0 * * * *` (every hour at minute 0)
- **Timezone**: UTC
- **Deduplication**: Prevents multiple records for the same city/hour
- **Manual Trigger**: Available via GitHub Actions UI

## 🔍 Monitoring & Verification

### GitHub Actions Logs
Check workflow runs in your repository:
`Actions > Auto Collect Air Quality Data > [Latest Run]`

### Expected Log Output
```
🚀 STARTING AUTOMATIC AIR QUALITY DATA COLLECTION
============================================================
📅 Timestamp: 2025-11-03T04:00:00.000Z
🕐 UTC Hour: 4:00
🏙️  Cities: Chennai, Delhi, Bengaluru, Hyderabad, Mumbai, Kolkata
🔗 Database: Connected
============================================================

📍 Processing Chennai...
✅ Chennai: Data collected from WAQI
✅ Chennai inserted at 2025-11-03T04:00:00.000Z

[... similar for all 6 cities ...]

============================================================
📊 COLLECTION SUMMARY
============================================================
✅ Inserted: 6 cities
⚠️  Skipped (duplicates): 0 cities
❌ Errors: 0 cities

🎉 ✅ AUTO COLLECTION VERIFIED
   Successfully inserted 6 new hourly records
   Timestamp: 2025-11-03T04:00:00.000Z
```

### Database Verification
Query your database to verify new records:
```sql
SELECT city, recorded_at, aqi, pm25, data_source 
FROM air_quality_data 
WHERE recorded_at >= NOW() - INTERVAL '1 hour'
ORDER BY recorded_at DESC;
```

## 🛡️ Error Handling & Reliability

### API Failures
- **Retry Logic**: Up to 3 attempts per API call with 2-second delays
- **Fallback Chain**: WAQI → OpenWeatherMap → Generated fallback data
- **Never Fails**: Always generates data even if all APIs are down

### Database Issues
- **Connection Testing**: Verifies database connectivity before collection
- **Duplicate Prevention**: Checks existing records for same city/hour
- **Transaction Safety**: Proper error handling and connection cleanup

### Workflow Reliability
- **Independent Execution**: Runs without your server being online
- **Proper Dependencies**: Installs required packages automatically
- **Clear Exit Codes**: Reports success/failure for monitoring

## 🔧 Troubleshooting

### No New Records Inserted
1. Check if records already exist for the current hour (normal behavior)
2. Verify `DATABASE_URL` secret is correctly set in GitHub
3. Check GitHub Actions logs for specific error messages

### API Rate Limits
- WAQI demo token has rate limits; get a proper token for production
- OpenWeatherMap fallback reduces dependency on single API
- Fallback data generation ensures collection never completely fails

### Manual Testing
```bash
cd AirQuality_Analytics/scripts
node collect_data.js  # Run locally to test
```

## 📈 Success Metrics

Your automation is working correctly when you see:

✅ **GitHub Actions runs every hour** (check Actions tab)  
✅ **New database records every hour** (6 cities per run)  
✅ **No manual intervention required**  
✅ **Consistent data collection** even during server downtime  
✅ **Clear success/failure reporting** in workflow logs  

## 🎯 Next Steps

1. **Monitor First 24 Hours**: Check that collections run smoothly
2. **Set Up Notifications**: Configure GitHub to notify on workflow failures  
3. **Optimize API Keys**: Add proper WAQI/OpenWeather tokens for better data
4. **Dashboard Integration**: Use collected data in your web application

---

Your automated air quality data collection system is now running independently on GitHub Actions! 🎉