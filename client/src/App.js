import React, { useState } from "react";
import axios from "axios";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line
} from "recharts";
import "./App.css";

function groupSnapshot(results) {
  if (!results || !Array.isArray(results) || results.length === 0) {
    return [];
  }
  
  const map = {};
  results.forEach(r => {
    // Validate required fields
    if (!r || !r.pollutant || typeof r.value !== 'number' || isNaN(r.value)) {
      return; // Skip invalid records
    }
    
    const key = r.pollutant.toUpperCase();
    if (!map[key]) {
      map[key] = { 
        sum: 0, 
        count: 0, 
        unit: r.unit || '' 
      };
    }
    map[key].sum += r.value;
    map[key].count += 1;
  });
  
  return Object.keys(map)
    .filter(k => map[k].count > 0) // Only include pollutants with valid data
    .map(k => ({ 
      pollutant: k, 
      value: +(map[k].sum / map[k].count).toFixed(2), 
      unit: map[k].unit 
    }))
    .sort((a, b) => a.pollutant.localeCompare(b.pollutant)); // Sort for consistency
}

function bucketBy(results, bucketType) {
  if (!results || !Array.isArray(results) || results.length === 0) {
    return [];
  }
  
  const buckets = {};
  results.forEach(r => {
    // Validate record structure
    if (!r || !r.pollutant || typeof r.value !== 'number' || isNaN(r.value)) {
      return; // Skip invalid records
    }
    
    // Handle different date formats more robustly
    let dateStr = r.dateUTC || r.dateLocal || r.date;
    if (!dateStr) return; // Skip if no date
    
    // Convert date string to proper format if needed
    if (typeof dateStr === 'string' && !dateStr.includes('T') && !dateStr.includes('Z')) {
      // Handle "2025-09-29 14:00:00" format
      dateStr = dateStr.replace(' ', 'T') + 'Z';
    }
    
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return; // Skip invalid dates
    
    let key = "";
    if (bucketType === "hour") {
      key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")} ${String(d.getUTCHours()).padStart(2,"0")}:00`;
    } else if (bucketType === "day") {
      key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
    } else if (bucketType === "month") {
      key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`;
    } else {
      key = d.toISOString();
    }
    if (!buckets[key]) buckets[key] = {};
    if (!buckets[key][r.pollutant]) buckets[key][r.pollutant] = { sum: 0, count: 0 };
    buckets[key][r.pollutant].sum += r.value;
    buckets[key][r.pollutant].count += 1;
  });
  const result = Object.keys(buckets).sort().map(key => {
    const obj = { time: key };
    Object.keys(buckets[key]).forEach(p => {
      obj[p.toUpperCase()] = +(buckets[key][p].sum / buckets[key][p].count).toFixed(2);
    });
    return obj;
  });
  return result;
}

// Convert AQI to actual pollutant units
function getActualUnit(pollutant, unit) {
  if (unit !== "AQI") return unit;
  
  const unitMap = {
    'PM25': 'µg/m³',
    'PM10': 'µg/m³', 
    'NO2': 'µg/m³',
    'SO2': 'µg/m³',
    'O3': 'µg/m³',
    'CO': 'mg/m³',
    'DEW': '°C',
    'H': '%',
    'T': '°C',
    'W': 'm/s',
    'WG': 'm/s',
    'P': 'hPa',
    'BC': 'µg/m³',
    'NH3': 'µg/m³'
  };
  
  return unitMap[pollutant] || 'µg/m³';
}

// Get pollutant explanations
function getPollutantExplanation(pollutant) {
  const explanations = {
    'PM25': 'Fine particles from vehicle exhaust and smoke. Most dangerous for health - penetrates deep into lungs.',
    'PM10': 'Coarse particles from dust and pollen. Affects upper respiratory system and can worsen asthma.',
    'NO2': 'Nitrogen dioxide from car emissions and power plants. Causes lung irritation and breathing problems.',
    'O3': 'Ground-level ozone formed in sunlight. Causes chest pain, coughing, and throat irritation.',
    'SO2': 'Sulfur dioxide from coal burning and refineries. Leads to breathing difficulties and eye irritation.',
    'CO': 'Carbon monoxide from vehicle exhaust. Reduces oxygen delivery to organs - can be lethal.',
    'DEW': 'Dew point temperature when air becomes saturated with moisture. Affects pollutant dispersion.',
    'H': 'Relative humidity - moisture in air. Low humidity helps disperse pollutants more effectively.',
    'T': 'Air temperature measurement. Higher temperatures can increase ozone formation reactions.',
    'W': 'Wind speed - air movement rate. Higher wind speeds help disperse and clear pollutants.',
    'WG': 'Wind gust - sudden increases in wind speed. Can provide quick temporary air quality improvements.',
    'P': 'Atmospheric pressure. High pressure systems can trap pollutants close to ground level.',
    'BC': 'Black carbon from incomplete combustion. Contributes to respiratory problems and climate warming.',
    'NH3': 'Ammonia from agriculture and fertilizers. Causes eye and throat irritation at high levels.'
  };
  
  return explanations[pollutant] || 'Air quality measurement parameter.';
}

// WHO Air Quality Standards (µg/m³ for 24-hour average)
function getWHOStatus(pollutant, value, unit) {
  const pollutantName = pollutant.toUpperCase();
  
  // Handle PM2.5 (WHO standards: Good <15, Moderate 15-35, Poor 35-55, Very Poor >55)
  if (pollutantName.includes('PM2') || pollutantName === 'PM25') {
    if (unit === 'µg/m³' || unit === 'µg/m3' || unit === 'ug/m3') {
      if (value <= 15) return { status: "Good", color: "#22c55e", emoji: "😊" };
      if (value <= 35) return { status: "Moderate", color: "#eab308", emoji: "😐" };
      if (value <= 55) return { status: "Unhealthy for Sensitive", color: "#f97316", emoji: "😷" };
      return { status: "Unhealthy", color: "#ef4444", emoji: "😨" };
    } else if (unit === 'AQI') {
      // AQI scale for PM2.5
      if (value <= 50) return { status: "Good", color: "#22c55e", emoji: "😊" };
      if (value <= 100) return { status: "Moderate", color: "#eab308", emoji: "😐" };
      if (value <= 150) return { status: "Unhealthy for Sensitive", color: "#f97316", emoji: "😷" };
      return { status: "Unhealthy", color: "#ef4444", emoji: "😨" };
    }
  }
  
  // Handle PM10 (WHO standards: Good <45, Moderate 45-75, Poor 75-150, Very Poor >150)
  if (pollutantName.includes('PM10')) {
    if (unit === 'µg/m³' || unit === 'µg/m3' || unit === 'ug/m3') {
      if (value <= 45) return { status: "Good", color: "#22c55e", emoji: "😊" };
      if (value <= 75) return { status: "Moderate", color: "#eab308", emoji: "😐" };
      if (value <= 150) return { status: "Unhealthy for Sensitive", color: "#f97316", emoji: "😷" };
      return { status: "Unhealthy", color: "#ef4444", emoji: "😨" };
    } else if (unit === 'AQI') {
      if (value <= 50) return { status: "Good", color: "#22c55e", emoji: "😊" };
      if (value <= 100) return { status: "Moderate", color: "#eab308", emoji: "😐" };
      if (value <= 150) return { status: "Unhealthy for Sensitive", color: "#f97316", emoji: "😷" };
      return { status: "Unhealthy", color: "#ef4444", emoji: "😨" };
    }
  }
  
  // Handle NO2 (WHO standards: Good <25, Moderate 25-50, Poor 50-100, Very Poor >100)
  if (pollutantName === 'NO2') {
    if (unit === 'µg/m³' || unit === 'µg/m3' || unit === 'ug/m3') {
      if (value <= 25) return { status: "Good", color: "#22c55e", emoji: "😊" };
      if (value <= 50) return { status: "Moderate", color: "#eab308", emoji: "😐" };
      if (value <= 100) return { status: "Unhealthy for Sensitive", color: "#f97316", emoji: "😷" };
      return { status: "Unhealthy", color: "#ef4444", emoji: "😨" };
    } else if (unit === 'AQI') {
      if (value <= 50) return { status: "Good", color: "#22c55e", emoji: "😊" };
      if (value <= 100) return { status: "Moderate", color: "#eab308", emoji: "😐" };
      return { status: "Unhealthy", color: "#ef4444", emoji: "😨" };
    }
  }
  
  // Handle O3/Ozone
  if (pollutantName === 'O3' || pollutantName === 'OZONE') {
    if (unit === 'AQI') {
      if (value <= 50) return { status: "Good", color: "#22c55e", emoji: "😊" };
      if (value <= 100) return { status: "Moderate", color: "#eab308", emoji: "😐" };
      if (value <= 150) return { status: "Unhealthy for Sensitive", color: "#f97316", emoji: "😷" };
      return { status: "Unhealthy", color: "#ef4444", emoji: "😨" };
    }
  }
  
  // Handle SO2
  if (pollutantName === 'SO2') {
    if (unit === 'AQI') {
      if (value <= 50) return { status: "Good", color: "#22c55e", emoji: "😊" };
      if (value <= 100) return { status: "Moderate", color: "#eab308", emoji: "😐" };
      return { status: "Unhealthy", color: "#ef4444", emoji: "😨" };
    }
  }
  
  // Handle CO
  if (pollutantName === 'CO') {
    if (unit === 'AQI') {
      if (value <= 50) return { status: "Good", color: "#22c55e", emoji: "😊" };
      if (value <= 100) return { status: "Moderate", color: "#eab308", emoji: "😐" };
      return { status: "Unhealthy", color: "#ef4444", emoji: "😨" };
    }
  }
  
  // Handle environmental parameters (Temperature, Humidity, etc.)
  if (pollutantName === 'T' || pollutantName === 'TEMP' || pollutantName === 'TEMPERATURE') {
    if (unit === '°C' || unit === 'C') {
      if (value >= 20 && value <= 25) return { status: "Good", color: "#22c55e", emoji: "😊" };
      if (value >= 15 && value <= 30) return { status: "Moderate", color: "#eab308", emoji: "😐" };
      return { status: "Moderate", color: "#eab308", emoji: "😐" };
    }
  }
  
  if (pollutantName === 'H' || pollutantName === 'HUMIDITY') {
    if (unit === '%') {
      if (value >= 40 && value <= 60) return { status: "Good", color: "#22c55e", emoji: "😊" };
      if (value >= 30 && value <= 70) return { status: "Moderate", color: "#eab308", emoji: "😐" };
      return { status: "Unhealthy for Sensitive", color: "#f97316", emoji: "😷" };
    }
  }
  
  // Default fallback for unknown pollutants
  if (value <= 25) return { status: "Good", color: "#22c55e", emoji: "😊" };
  if (value <= 50) return { status: "Moderate", color: "#eab308", emoji: "😐" };
  if (value <= 100) return { status: "Unhealthy for Sensitive", color: "#f97316", emoji: "😷" };
  return { status: "Unhealthy", color: "#ef4444", emoji: "😨" };
}

function App() {
  const [city, setCity] = useState("");
  const [fromYear, setFromYear] = useState("");
  const [toYear, setToYear] = useState("");
  const [fromMonth, setFromMonth] = useState("");
  const [toMonth, setToMonth] = useState("");
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");
  const [fromHour, setFromHour] = useState("");
  const [toHour, setToHour] = useState("");
  const [data, setData] = useState(null);
  const [chartMode, setChartMode] = useState("snapshot");
  const [advice, setAdvice] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [statusBanners, setStatusBanners] = useState({ historical: null, liveMonitoring: null });

  // Fetch status banners on page load
  React.useEffect(() => {
    const fetchStatusBanners = async () => {
      try {
        // Fetch historical data availability
        const historicalRes = await axios.get("/api/data-availability");
        const historicalData = historicalRes.data;
        
        // Fetch live monitoring status
        const liveRes = await axios.get("/api/collection-status");
        const liveData = liveRes.data;
        
        setStatusBanners({
          historical: {
            totalRecords: historicalData.data_availability?.overall_summary?.total_records || 0,
            earliestDate: historicalData.data_availability?.overall_summary?.earliest_date,
            latestDate: historicalData.data_availability?.overall_summary?.latest_date,
            citiesCount: historicalData.data_availability?.cities_available?.length || 0
          },
          liveMonitoring: {
            status: liveData.status,
            description: liveData.description,
            nextCollection: liveData.nextCollection,
            capabilities: liveData.capabilities || []
          }
        });
      } catch (err) {
        console.error("Failed to fetch status banners:", err);
      }
    };
    
    fetchStatusBanners();
  }, []);

  const handleShow = async () => {
    try {
      setError("");
      setAdvice(null);
      setData(null);
      setIsLoading(true);
      
      if (!city) {
        setError("Please enter a city name");
        setIsLoading(false);
        return;
      }

      // Validate date filters before sending request
      const currentYear = new Date().getFullYear();
      let validFromYear = null, validToYear = null;
      let validFromMonth = null, validToMonth = null;
      let validFromDay = null, validToDay = null;
      let validFromHour = null, validToHour = null;

      // Validate years
      if (fromYear) {
        const fyear = parseInt(fromYear, 10);
        if (fyear >= 2000 && fyear <= currentYear) {
          validFromYear = fyear;
        } else {
          setError("From Year must be between 2000 and " + currentYear);
          setIsLoading(false);
          return;
        }
      }

      if (toYear) {
        const tyear = parseInt(toYear, 10);
        if (tyear >= 2000 && tyear <= currentYear) {
          validToYear = tyear;
        } else {
          setError("To Year must be between 2000 and " + currentYear);
          setIsLoading(false);
          return;
        }
      }

      // Validate year range
      if (validFromYear && validToYear && validFromYear > validToYear) {
        setError("From Year cannot be greater than To Year");
        setIsLoading(false);
        return;
      }

      // Validate months
      if (fromMonth) {
        const fmonth = parseInt(fromMonth, 10);
        if (fmonth >= 1 && fmonth <= 12) {
          validFromMonth = fmonth;
        } else {
          setError("From Month must be between 1 and 12");
          setIsLoading(false);
          return;
        }
      }

      if (toMonth) {
        const tmonth = parseInt(toMonth, 10);
        if (tmonth >= 1 && tmonth <= 12) {
          validToMonth = tmonth;
        } else {
          setError("To Month must be between 1 and 12");
          setIsLoading(false);
          return;
        }
      }

      // Validate days
      if (fromDay) {
        const fday = parseInt(fromDay, 10);
        if (fday >= 1 && fday <= 31) {
          validFromDay = fday;
        } else {
          setError("From Day must be between 1 and 31");
          setIsLoading(false);
          return;
        }
      }

      if (toDay) {
        const tday = parseInt(toDay, 10);
        if (tday >= 1 && tday <= 31) {
          validToDay = tday;
        } else {
          setError("To Day must be between 1 and 31");
          setIsLoading(false);
          return;
        }
      }

      // Validate hours (format: HH:MM)
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (fromHour && fromHour.trim()) {
        if (timeRegex.test(fromHour.trim())) {
          validFromHour = fromHour.trim();
        } else {
          setError("From Hour must be in HH:MM format (00:00 to 23:59)");
          setIsLoading(false);
          return;
        }
      }

      if (toHour && toHour.trim()) {
        if (timeRegex.test(toHour.trim())) {
          validToHour = toHour.trim();
        } else {
          setError("To Hour must be in HH:MM format (00:00 to 23:59)");
          setIsLoading(false);
          return;
        }
      }

      const body = {
        city: city.trim(),
        fromYear: validFromYear,
        toYear: validToYear,
        fromMonth: validFromMonth,
        toMonth: validToMonth,
        fromDay: validFromDay,
        toDay: validToDay,
        fromHour: validFromHour,
        toHour: validToHour
      };

      const res = await axios.post("/api/hybrid-measurements", body);
      const payload = res.data;
      
      // Validate response data
      if (!payload) {
        setError("No data received from server");
        setIsLoading(false);
        return;
      }

      if (!payload.results || !Array.isArray(payload.results) || payload.results.length === 0) {
        setError("No air quality measurements found for the specified location and time range. Try different dates or a different city.");
        setIsLoading(false);
        return;
      }

      // Validate that results have required fields
      const validResults = payload.results.filter(result => 
        result && 
        result.pollutant && 
        typeof result.value === 'number' && 
        !isNaN(result.value)
      );

      if (validResults.length === 0) {
        setError("Retrieved data is invalid or corrupted. Please try again.");
        setIsLoading(false);
        return;
      }

      const snapshot = groupSnapshot(validResults);
      
      // Ensure snapshot has data
      if (!snapshot || snapshot.length === 0) {
        setError("Unable to process air quality data. Please try a different location or time range.");
        setIsLoading(false);
        return;
      }

      setData({ 
        city: payload.city, 
        snapshot, 
        measurements: validResults, 
        from: payload.from, 
        to: payload.to,
        apiInfo: payload.apiInfo,
        totalResults: payload.results.length,
        validResults: validResults.length
      });
      if (body.fromYear || body.toYear || body.fromMonth || body.toMonth || body.fromDay || body.toDay) {
        setChartMode("timeseries");
      } else {
        setChartMode("snapshot");
      }

      try {
        const adviceRes = await axios.post("/api/insights", { city: payload.city, data: payload.results });
        setAdvice({
          text: adviceRes.data.insights || "",
          source: adviceRes.data.source || "Professional Health Advisory System",
          isAI: adviceRes.data.source === "Gemini AI"
        });
      } catch (err) {
        setAdvice({
          text: payload.localAdvice || "",
          source: payload.apiInfo?.adviceSource || "Rule-based system",
          isAI: payload.apiInfo?.adviceSource === "Gemini AI"
        });
      }
      setIsLoading(false);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to fetch data");
      setIsLoading(false);
    }
  };

  const snapshotSeries = data ? data.snapshot : [];
  const timeSeries = data ? (() => {
    const bucketType = (fromDay || toDay) ? "hour" : (fromMonth || toMonth) ? "day" : (fromYear || toYear) ? "month" : "hour";
    // Use data.results instead of data.measurements for proper chart data
    const buckets = bucketBy(data.results || [], bucketType);
    console.log("Chart data processed:", { 
      buckets: buckets.length, 
      bucketType, 
      rawResults: data.results?.length,
      measurements: data.measurements?.length 
    });
    return buckets;
  })() : [];

  const pollutants = snapshotSeries.map(s => s.pollutant);
  console.log("Pollutants for chart:", pollutants);

  return (
    <div className="main-container">
      {/* Header Section - Centered title and search */}
      <div className="header-section">
        <h1 className="main-title">Air Quality Analytics</h1>
        <div className="search-bar">
          <input 
            placeholder="Enter city (e.g. Delhi)" 
            value={city} 
            onChange={e => setCity(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleShow();
              }
            }}
          />
          <button 
            onClick={handleShow} 
            className={`show-data-btn ${isLoading ? 'loading' : ''}`}
            disabled={isLoading}
          >
            {isLoading && <span className="spinner"></span>}
            Show Data
          </button>
        </div>
      </div>

      {/* Status Banners */}
      {statusBanners.historical && (
        <div style={{
          backgroundColor: '#f0f8ff',
          border: '1px solid #ddd',
          borderRadius: '5px',
          padding: '10px 15px',
          margin: '10px 0',
          fontSize: '14px'
        }}>
          <span style={{marginRight: '8px'}}>📊</span>
          <strong>Historical Data:</strong>
          <span style={{ marginLeft: '8px' }}>
            {statusBanners.historical.totalRecords} records
            {statusBanners.historical.earliestDate && statusBanners.historical.latestDate && (
              <span> from {statusBanners.historical.earliestDate} to {statusBanners.historical.latestDate}</span>
            )}
            {statusBanners.historical.citiesCount > 0 && (
              <span> • {statusBanners.historical.citiesCount} cities monitored</span>
            )}
            <span> • Use date filters for historical searches</span>
          </span>
        </div>
      )}

      {statusBanners.liveMonitoring && (
        <div style={{
          backgroundColor: '#f0f8ff',
          border: '1px solid #ddd',
          borderRadius: '5px',
          padding: '10px 15px',
          margin: '10px 0',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <span style={{marginRight: '8px'}}>🔴</span>
            <strong>Live Monitoring:</strong>
          </div>
          
          <div style={{ 
            flex: 1, 
            overflow: 'hidden', 
            whiteSpace: 'nowrap',
            position: 'relative',
            height: '20px'
          }}>
            <span className="scrolling-cities">
              Delhi, India • Mumbai, India • Bengaluru, India • Chennai, India • Kolkata, India • Hyderabad, India • Delhi, India • Mumbai, India • Bengaluru, India • Chennai, India
            </span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <span style={{
              backgroundColor: '#28a745',
              color: 'white',
              padding: '2px 6px',
              borderRadius: '3px',
              fontSize: '11px',
              fontWeight: 'bold'
            }}>
              LIVE
            </span>
            <span style={{ fontSize: '12px', color: '#666' }}>
              6 cities • Always active
            </span>
          </div>
        </div>
      )}

      {/* Filters Section - Horizontal line of dropdowns */}
      <div className="filters-section">
        <div className="filter-item">
          <label>From Year</label>
          <select value={fromYear} onChange={e => setFromYear(e.target.value)}>
            <option value="">--</option>
            <option>2021</option>
            <option>2022</option>
            <option>2023</option>
            <option>2024</option>
            <option>2025</option>
          </select>
        </div>
        <div className="filter-item">
          <label>To Year</label>
          <select value={toYear} onChange={e => setToYear(e.target.value)}>
            <option value="">--</option>
            <option>2021</option>
            <option>2022</option>
            <option>2023</option>
            <option>2024</option>
            <option>2025</option>
          </select>
        </div>
        <div className="filter-item">
          <label>From Month</label>
          <select value={fromMonth} onChange={e => setFromMonth(e.target.value)}>
            <option value="">--</option>
            <option value="1">Jan</option>
            <option value="2">Feb</option>
            <option value="3">Mar</option>
            <option value="4">Apr</option>
            <option value="5">May</option>
            <option value="6">Jun</option>
            <option value="7">Jul</option>
            <option value="8">Aug</option>
            <option value="9">Sep</option>
            <option value="10">Oct</option>
            <option value="11">Nov</option>
            <option value="12">Dec</option>
          </select>
        </div>
        <div className="filter-item">
          <label>To Month</label>
          <select value={toMonth} onChange={e => setToMonth(e.target.value)}>
            <option value="">--</option>
            <option value="1">Jan</option>
            <option value="2">Feb</option>
            <option value="3">Mar</option>
            <option value="4">Apr</option>
            <option value="5">May</option>
            <option value="6">Jun</option>
            <option value="7">Jul</option>
            <option value="8">Aug</option>
            <option value="9">Sep</option>
            <option value="10">Oct</option>
            <option value="11">Nov</option>
            <option value="12">Dec</option>
          </select>
        </div>
        <div className="filter-item">
          <label>From Day</label>
          <select value={fromDay} onChange={e => setFromDay(e.target.value)}>
            <option value="">--</option>
            {Array.from({ length: 31 }, (_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}
          </select>
        </div>
        <div className="filter-item">
          <label>To Day</label>
          <select value={toDay} onChange={e => setToDay(e.target.value)}>
            <option value="">--</option>
            {Array.from({ length: 31 }, (_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}
          </select>
        </div>
        <div className="filter-item">
          <label>From Hour</label>
          <select value={fromHour} onChange={e => setFromHour(e.target.value)}>
            <option value="">--</option>
            {Array.from({ length: 24 }, (_, i) => {
              const h = i.toString().padStart(2, "0") + ":00";
              return <option key={i} value={h}>{h}</option>;
            })}
          </select>
        </div>
        <div className="filter-item">
          <label>To Hour</label>
          <select value={toHour} onChange={e => setToHour(e.target.value)}>
            <option value="">--</option>
            {Array.from({ length: 24 }, (_, i) => {
              const h = i.toString().padStart(2, "0") + ":00";
              return <option key={i} value={h}>{h}</option>;
            })}
          </select>
        </div>
      </div>

      {/* Content Section - Chart and advice on top, full-width table below */}
      <div className="content-section">
        <div className="top-content">
          <div className="left-section">
          <div className="chart-container">
            <h2>Pollutant Levels {data ? `in ${data.city}` : ""}</h2>

            {isLoading && (
              <div className="chart-loading">
                <div className="skeleton-loader">
                  <div className="skeleton-bar"></div>
                  <div className="skeleton-bar"></div>
                  <div className="skeleton-bar"></div>
                  <div className="skeleton-bar"></div>
                  <div className="skeleton-bar"></div>
                  <div className="skeleton-bar"></div>
                </div>
                <p className="loading-text">Fetching pollutant levels for {city}... Please wait.</p>
              </div>
            )}

            {!data && !isLoading && <p style={{ color: "gray" }}>No data yet. Enter a city and click Show Data.</p>}

            {data && !isLoading && chartMode === "snapshot" && (
              <div style={{ width: "100%", height: 320 }} className="fade-in">
                <ResponsiveContainer>
                  <BarChart data={snapshotSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="pollutant" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="value" fill="#4f8df6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {data && !isLoading && chartMode === "timeseries" && (
              <div style={{ width: "100%", height: 320 }} className="fade-in">
                <ResponsiveContainer>
                  <LineChart data={timeSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {pollutants.map((p, idx) => (
                      <Line key={p} type="monotone" dataKey={p} stroke={["#4f8df6", "#82ca9d", "#ff7f50", "#8884d8", "#ffc658"][idx % 5]} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {data && (
              <div style={{marginTop: "16px", padding: "12px", backgroundColor: "#f0f8ff", borderRadius: "5px"}}>
                <strong>Location:</strong> {data.measurements?.[0]?.location || data.city || 'Unknown Location'}
                <div style={{fontSize: "12px", color: "#666", marginTop: "6px"}}>
                  {(() => {
                    // Determine date range info
                    const hasDateFilters = fromYear || toYear || fromMonth || toMonth || fromDay || toDay || fromHour || toHour;
                    let dateInfo = "";
                    
                    if (hasDateFilters) {
                      const fromParts = [];
                      const toParts = [];
                      if (fromYear) fromParts.push(fromYear);
                      if (fromMonth) fromParts.push(String(fromMonth).padStart(2, '0'));
                      if (fromDay) fromParts.push(String(fromDay).padStart(2, '0'));
                      if (fromHour) fromParts.push(fromHour);
                      
                      if (toYear) toParts.push(toYear);
                      if (toMonth) toParts.push(String(toMonth).padStart(2, '0'));
                      if (toDay) toParts.push(String(toDay).padStart(2, '0'));
                      if (toHour) toParts.push(toHour);
                      
                      const fromDate = fromParts.length > 0 ? fromParts.join('-') : '';
                      const toDate = toParts.length > 0 ? toParts.join('-') : '';
                      
                      if (fromDate && toDate) {
                        dateInfo = `Filtered data from ${fromDate} to ${toDate}`;
                      } else if (fromDate) {
                        dateInfo = `Filtered data from ${fromDate}`;
                      } else if (toDate) {
                        dateInfo = `Filtered data up to ${toDate}`;
                      } else {
                        dateInfo = "Filtered data range applied";
                      }
                    } else {
                      // Check if data is current or historical
                      const latestDate = data.measurements?.[0]?.dateLocal || data.measurements?.[0]?.dateUTC;
                      if (latestDate) {
                        const dataDate = new Date(latestDate);
                        const now = new Date();
                        const hoursDiff = (now - dataDate) / (1000 * 60 * 60);
                        
                        if (hoursDiff < 2) {
                          dateInfo = "Current data (updated within 2 hours)";
                        } else if (hoursDiff < 24) {
                          dateInfo = `Recent data (${Math.round(hoursDiff)} hours old)`;
                        } else {
                          const daysDiff = Math.round(hoursDiff / 24);
                          dateInfo = `Historical data (${daysDiff} day${daysDiff !== 1 ? 's' : ''} old)`;
                        }
                      } else {
                        dateInfo = "Data timestamp unavailable";
                      }
                    }
                    
                    // Try to extract coordinates from location
                    const locationStr = data.measurements?.[0]?.location || '';
                    let coordsInfo = '';
                    
                    // Extract map coordinates from location string
                    if (locationStr.includes(',')) {
                      const parts = locationStr.split(',');
                      if (parts.length >= 2) {
                        const region = parts[parts.length-2]?.trim();
                        const country = parts[parts.length-1]?.trim();
                        if (region && country) {
                          coordsInfo = ` • Map: ${region}, ${country}`;
                        }
                      }
                    }
                    
                    return `${dateInfo}${coordsInfo}`;
                  })()}
                </div>
              </div>
            )}
          </div>

        </div>

        <div className="advice-container">
          {isLoading && (
            <div className="advice-loading">
              <div className="loading-card">
                <h3 className="loading-header">
                  <span className="robot-icon">🤖</span> Generating AI-powered advice<span className="bouncing-dots">
                    <span className="dot">.</span>
                    <span className="dot">.</span>
                    <span className="dot">.</span>
                  </span>
                </h3>
              </div>
            </div>
          )}
          
          {advice && !isLoading && (
            <div className="advice fade-in">
              <h3 className="advice-header">
                {advice.isAI ? (
                  <>
                    <span className="robot-icon">🤖</span> Health Advice (AI-powered)
                  </>
                ) : (
                  <>
                    <span className="rule-icon">📋</span> Health Advice (Rule-based)
                  </>
                )}
              </h3>
              <p>{advice.text}</p>
            </div>
          )}
          {error && <p className="error">{error}</p>}
        </div>
        </div>

        {/* Full-width Data Table Section */}
        {data && (
          <div className="table-section">
            <h3>Air Quality Measurements</h3>
            <table>
              <thead>
                <tr><th>Pollutant</th><th>Value</th><th>Unit</th><th>Last Updated</th><th>WHO Status</th></tr>
              </thead>
              <tbody>
                {data.snapshot.map((row, i) => {
                  const whoStatus = getWHOStatus(row.pollutant, row.value, row.unit);
                  const actualUnit = getActualUnit(row.pollutant, row.unit);
                  const originalMeasurement = data.measurements.find(m => m.pollutant.toUpperCase() === row.pollutant);
                  const explanation = getPollutantExplanation(row.pollutant);
                  return (
                    <tr key={i}>
                      <td className="pollutant-cell">
                        <span className="pollutant-name">{row.pollutant}</span>
                        <div className="pollutant-explanation">
                          {explanation}
                        </div>
                      </td>
                      <td>{row.value}</td>
                      <td>{actualUnit}</td>
                      <td>{originalMeasurement?.dateLocal || ""}</td>
                      <td style={{color: whoStatus.color, fontWeight: "600"}}>
                        <span style={{marginRight: "4px"}}>{whoStatus.emoji}</span>
                        {whoStatus.status}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;