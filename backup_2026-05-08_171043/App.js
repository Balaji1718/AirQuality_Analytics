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
        unit: r.unit || '',
        latestUpdated: ""
      };
    }
    map[key].sum += r.value;
    map[key].count += 1;

    const rowTimestamp = r.dateUTC || r.dateLocal || r.date || r.recorded_at;
    if (rowTimestamp) {
      const parsedTimestamp = new Date(rowTimestamp);
      if (!isNaN(parsedTimestamp.getTime())) {
        const currentLatest = map[key].latestUpdated ? new Date(map[key].latestUpdated) : null;
        if (!currentLatest || parsedTimestamp > currentLatest) {
          map[key].latestUpdated = parsedTimestamp.toISOString();
        }
      }
    }
  });
  
  return Object.keys(map)
    .filter(k => map[k].count > 0) // Only include pollutants with valid data
    .map(k => ({ 
      pollutant: k, 
      value: +(map[k].sum / map[k].count).toFixed(2), 
      unit: map[k].unit,
      latestUpdated: map[k].latestUpdated
    }))
    .sort((a, b) => a.pollutant.localeCompare(b.pollutant)); // Sort for consistency
}

function groupLatestSnapshot(results) {
  if (!results || !Array.isArray(results) || results.length === 0) {
    return [];
  }

  const latestByPollutant = {};

  results.forEach(r => {
    if (!r || !r.pollutant || typeof r.value !== 'number' || isNaN(r.value)) {
      return;
    }

    const key = r.pollutant.toUpperCase();
    const rowTimestamp = r.dateUTC || r.dateLocal || r.date || r.recorded_at;
    const parsedTimestamp = rowTimestamp ? new Date(rowTimestamp) : null;
    const parsedTime = parsedTimestamp && !isNaN(parsedTimestamp.getTime()) ? parsedTimestamp.getTime() : null;
    const currentTime = latestByPollutant[key]?.time || null;

    if (!latestByPollutant[key] || (parsedTime !== null && (currentTime === null || parsedTime >= currentTime))) {
      latestByPollutant[key] = {
        pollutant: key,
        value: +r.value,
        unit: r.unit || '',
        latestUpdated: parsedTime !== null ? parsedTimestamp.toISOString() : '',
        time: parsedTime
      };
    }
  });

  return Object.values(latestByPollutant)
    .map(({ time, ...row }) => row)
    .sort((a, b) => a.pollutant.localeCompare(b.pollutant));
}

// Show all 8 available pollutants, with "Not available" for missing data in filtered range
function getFullPollutantTable(filteredData) {
  const availablePollutants = ['PM25', 'PM10', 'NO2', 'SO2', 'CO', 'O3', 'T', 'H'];
  
  const latestByPollutant = {};
  
  // Build map of available data from filtered results
  if (filteredData && Array.isArray(filteredData)) {
    filteredData.forEach(r => {
      const p = r.pollutant?.toUpperCase();
      if (p) {
        const rowTimestamp = r.dateUTC || r.dateLocal || r.date || r.recorded_at;
        const parsedTimestamp = rowTimestamp ? new Date(rowTimestamp) : null;
        const parsedTime = parsedTimestamp && !isNaN(parsedTimestamp.getTime()) ? parsedTimestamp.getTime() : null;
        const currentTime = latestByPollutant[p]?.time || null;
        
        if (!latestByPollutant[p] || (parsedTime !== null && (currentTime === null || parsedTime >= currentTime))) {
          latestByPollutant[p] = {
            pollutant: p,
            value: r.value,
            unit: r.unit || '',
            latestUpdated: parsedTime !== null ? parsedTimestamp.toISOString() : '',
            time: parsedTime
          };
        }
      }
    });
  }
  
  // Create table rows for all 8 available pollutants
  const tableRows = availablePollutants.map(pollutant => {
    if (latestByPollutant[pollutant]) {
      return latestByPollutant[pollutant];
    } else {
      // Return row with "Not available" marker
      return {
        pollutant,
        value: null,
        unit: '',
        latestUpdated: '',
        notAvailable: true
      };
    }
  });
  
  return tableRows;
}

function buildFilterLabel(filters) {
  const formatDate = (year, month, day, hour) => {
    const parts = [];
    if (year) parts.push(year);
    if (month) parts.push(String(month).padStart(2, '0'));
    if (day) parts.push(String(day).padStart(2, '0'));
    const datePart = parts.join('-');
    return hour ? `${datePart} ${hour}` : datePart;
  };

  const inferHistoricalEnd = () => {
    if (!filters.fromYear) {
      return "";
    }

    const endYear = filters.toYear || filters.fromYear;
    const endMonth = filters.toMonth || filters.fromMonth || 12;
    const inferredDay = filters.toDay || filters.fromDay || (filters.toMonth || filters.fromMonth ? new Date(Date.UTC(Number(endYear), Number(endMonth), 0)).getUTCDate() : 31);
    const endDay = inferredDay;
    const endHour = filters.toHour || "23:59";

    return formatDate(endYear, endMonth, endDay, endHour);
  };

  const fromDate = formatDate(filters.fromYear, filters.fromMonth, filters.fromDay, filters.fromHour);
  const toDate = inferHistoricalEnd();

  if (fromDate && toDate) {
    return `Historical data from ${fromDate} to ${toDate}`;
  }
  if (fromDate) {
    return `Historical data from ${fromDate}`;
  }
  if (toDate) {
    return `Historical data up to ${toDate}`;
  }
  return "Historical data range applied";
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

function getPollutantDetails(pollutant) {
  const key = (pollutant || '').toUpperCase();
  const details = {
    PM25: {
      name: 'PM2.5',
      description: 'Fine particulate matter from combustion and smoke. This is the most harmful everyday air pollutant because it reaches deep into the lungs.',
      whoAdvice: 'Keep exposure as low as possible when levels are elevated.',
      safetyAdvice: 'Use an N95 mask outdoors and avoid strenuous activity.'
    },
    PM10: {
      name: 'PM10',
      description: 'Coarse dust and particles from roads, construction, and pollen. It mainly affects the upper respiratory system.',
      whoAdvice: 'Sensitive groups should reduce exposure during dusty conditions.',
      safetyAdvice: 'Close windows and avoid outdoor exercise if levels are high.'
    },
    NO2: {
      name: 'NO2',
      description: 'Nitrogen dioxide from traffic and fuel combustion. It irritates the airways and can worsen asthma.',
      whoAdvice: 'Limit time near heavy traffic when concentrations rise.',
      safetyAdvice: 'Avoid roadside exercise and keep indoor air clean.'
    },
    O3: {
      name: 'O3',
      description: 'Ground-level ozone formed by sunlight reacting with pollution. It can trigger coughing and chest tightness.',
      whoAdvice: 'Avoid outdoor activity during hot sunny periods.',
      safetyAdvice: 'Stay indoors when ozone is elevated.'
    },
    SO2: {
      name: 'SO2',
      description: 'Sulfur dioxide from burning fossil fuels and industrial activity. It can irritate eyes and the respiratory tract.',
      whoAdvice: 'People with lung disease should limit exposure.',
      safetyAdvice: 'Reduce time outdoors near industrial sources.'
    },
    CO: {
      name: 'CO',
      description: 'Carbon monoxide from incomplete combustion and vehicle exhaust. High exposure can reduce oxygen delivery to the body.',
      whoAdvice: 'Avoid enclosed spaces with poor ventilation near combustion sources.',
      safetyAdvice: 'Keep engines and fuel-burning appliances well ventilated.'
    }
  };

  return details[key] || {
    name: key || 'Pollutant',
    description: 'Air quality measurement parameter.',
    whoAdvice: 'Monitor current conditions.',
    safetyAdvice: 'Follow local guidance and avoid prolonged exposure when readings rise.'
  };
}

function getLatestTimestamp(results) {
  if (!results || !Array.isArray(results) || results.length === 0) {
    return "";
  }

  const timestamps = results
    .map(result => result?.dateUTC || result?.dateLocal || result?.date || result?.recorded_at)
    .map(value => {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? null : parsed.getTime();
    })
    .filter(Boolean);

  if (timestamps.length === 0) {
    return "";
  }

  return new Date(Math.max(...timestamps)).toISOString();
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
  const [selectedPollutants, setSelectedPollutants] = useState(["PM10", "NO2", "O3"]);
  const [tableData, setTableData] = useState([]);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantModel, setAssistantModel] = useState("gpt-4o-mini"); // Model selection
  const [assistantProvider, setAssistantProvider] = useState("openrouter"); // Provider selection
  const [assistantMode, setAssistantMode] = useState("both"); // both | general | app
  const [assistantMessages, setAssistantMessages] = useState([
    {
      role: "assistant",
      content: "Ask me about the app, pollutants, filters, charts, or general air-quality questions."
    }
  ]);

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
        
        // Use common date range instead of overall range for better accuracy
        const commonRange = historicalData.data_availability?.common_data_range;
        const hasCommonData = commonRange && commonRange.total_days > 0;
        
        setStatusBanners({
          historical: {
            totalRecords: historicalData.data_availability?.overall_summary?.total_records || 0,
            earliestDate: hasCommonData ? commonRange.start_date : historicalData.data_availability?.overall_summary?.earliest_date,
            latestDate: hasCommonData ? commonRange.end_date : historicalData.data_availability?.overall_summary?.latest_date,
            citiesCount: historicalData.data_availability?.cities_available?.length || 0,
            commonDays: hasCommonData ? commonRange.total_days : 0,
            isCommonRange: hasCommonData
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

  // Sync tableData from server when filters are active (ensures table always matches server payload)
  React.useEffect(() => {
    if (!data || !city) return;
    
    const hasDateFilters = !!(fromYear || toYear || fromMonth || toMonth || fromDay || toDay || fromHour || toHour);
    if (!hasDateFilters) {
      // No filters: use snapshotSeries (computed from current data)
      setTableData(groupSnapshot(data.results || data.measurements || []));
      return;
    }

    // Filters active: fetch fresh data from server to ensure sync
    const fetchAndSync = async () => {
      try {
        const body = {
          city: city.trim(),
          fromYear: fromYear ? parseInt(fromYear, 10) : null,
          toYear: toYear ? parseInt(toYear, 10) : null,
          fromMonth: fromMonth ? parseInt(fromMonth, 10) : null,
          toMonth: toMonth ? parseInt(toMonth, 10) : null,
          fromDay: fromDay ? parseInt(fromDay, 10) : null,
          toDay: toDay ? parseInt(toDay, 10) : null,
          fromHour: fromHour ? fromHour.trim() : null,
          toHour: toHour ? toHour.trim() : null
        };
        const res = await axios.post("/api/hybrid-measurements", body);
        const payload = res.data;
        if (payload && payload.results && Array.isArray(payload.results)) {
          // Use getFullPollutantTable to show all 8 pollutants, with "Not available" for missing data
          const fullTable = getFullPollutantTable(payload.results);
          setTableData(fullTable);
          console.log("tableData synced from server with full pollutant table:", { count: fullTable.length, availableCount: fullTable.filter(r => !r.notAvailable).length });
        }
      } catch (err) {
        console.error("Failed to sync tableData:", err);
      }
    };

    fetchAndSync();
  }, [data, city, fromYear, toYear, fromMonth, toMonth, fromDay, toDay, fromHour, toHour]);

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
      const latestUpdated = payload.latestUpdated || getLatestTimestamp(validResults);
      
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
        results: validResults, // Add results for chart compatibility
        from: payload.from, 
        to: payload.to,
        apiInfo: payload.apiInfo,
        totalResults: payload.results.length,
        validResults: validResults.length,
        latestUpdated
      });
      // Persist last payload for debugging and ensure tableData uses the fetched results
      window.__lastHybridPayload = payload;
      const hasDateFilters = body.fromYear || body.toYear || body.fromMonth || body.toMonth || body.fromDay || body.toDay || body.fromHour || body.toHour;
      const computedTableData = hasDateFilters ? groupLatestSnapshot(validResults) : snapshot;
      setTableData(computedTableData);
      window.__lastTableData = computedTableData;
      // Set chart mode based on filter complexity
      if (hasDateFilters) {
        setChartMode("timeseries");
      } else {
        setChartMode("snapshot");
      }

      try {
        // Use a compact sample for advice generation to avoid oversized payloads
        const adviceSample = validResults.slice(0, 15);
        const adviceRes = await axios.post("/api/insights", { city: payload.city, data: adviceSample });
        setAdvice({
          text: adviceRes.data.insights || "",
          source: adviceRes.data.source || "Professional Health Advisory System",
          isAI: ["Groq AI", "OpenRouter AI"].includes(adviceRes.data.source)
        });
      } catch (err) {
        setAdvice({
          text: payload.localAdvice || "",
          source: payload.apiInfo?.adviceSource || "Rule-based system",
          isAI: ["Groq AI", "OpenRouter AI"].includes(payload.apiInfo?.adviceSource)
        });
      }
      setIsLoading(false);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to fetch data");
      setIsLoading(false);
    }
  };

  // Dynamic snapshot that updates based on current data and filters
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
  })() : [];
  
  const timeSeries = data ? (() => {
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
  })() : [];

  const hasDateFilters = !!(fromYear || toYear || fromMonth || toMonth || fromDay || toDay || fromHour || toHour);
  const filterLabel = hasDateFilters ? buildFilterLabel({ fromYear, toYear, fromMonth, toMonth, fromDay, toDay, fromHour, toHour }) : "";
  const tableRows = hasDateFilters ? (tableData && tableData.length ? tableData : groupLatestSnapshot(data?.results || data?.measurements || [])) : snapshotSeries;
  const chartData = chartMode === "timeseries" ? timeSeries : snapshotSeries;
  const pollutants = Array.from(new Set((data?.results || data?.measurements || []).map(row => row?.pollutant?.toUpperCase()).filter(Boolean)));
  const tableTimestampLabel = hasDateFilters ? "Historical Data" : "Current Data";
  const tableTitleLabel = hasDateFilters ? `Historical Air Quality Measurements • ${filterLabel}` : "Current Air Quality Measurements";
  
  const handlePollutantToggle = (pollutant) => {
    setSelectedPollutants(prev => 
      prev.includes(pollutant)
        ? prev.filter(p => p !== pollutant)
        : [...prev, pollutant]
    );
  };

  const handleSelectAll = () => {
    setSelectedPollutants(pollutants);
  };

  const handleDeselectAll = () => {
    setSelectedPollutants([]);
  };

  const handleAssistantSend = async () => {
    const question = assistantInput.trim();
    if (!question || assistantLoading) {
      return;
    }

    const appContext = {
      hasActiveFilters: hasDateFilters,
      filterLabel,
      chartMode,
      assistantMode,
      tablePreview: (tableRows || []).slice(0, 8).map(row => ({
        pollutant: row.pollutant,
        value: row.notAvailable ? "Not available" : row.value,
        unit: row.notAvailable ? "" : getActualUnit(row.pollutant, row.unit)
      }))
    };

    setAssistantMessages(prev => [...prev, { role: "user", content: question }]);
    setAssistantInput("");
    setAssistantLoading(true);

    try {
      const res = await axios.post("/api/assistant", {
        question,
        appContext,
        provider: assistantProvider,
        model: assistantModel
      });

      const answer = res.data?.answer || res.data?.response || res.data?.message || "I could not generate a response right now.";
      const source = res.data?.source || "Assistant";
      setAssistantMessages(prev => [...prev, { role: "assistant", content: answer, source }]);
    } catch (err) {
      const fallback = err.response?.data?.error || "Unable to reach the assistant at the moment. Please try again.";
      setAssistantMessages(prev => [...prev, { role: "assistant", content: fallback }]);
    } finally {
      setAssistantLoading(false);
    }
  };

  // Color mapping for pollutants (matches chart line colors)
  const pollutantColors = {
    PM10: "#82ca9d",
    PM25: "#4f8df6",
    NO2: "#ff7f50",
    NO: "#8884d8",
    O3: "#ffc658",
    SO2: "#82ca9d",
    CO: "#4f8df6"
  };
  
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
              <span>
                {statusBanners.historical.isCommonRange ? (
                  <span> • Common range: {statusBanners.historical.earliestDate} to {statusBanners.historical.latestDate} ({statusBanners.historical.commonDays} days with all 6 cities)</span>
                ) : (
                  <span> from {statusBanners.historical.earliestDate} to {statusBanners.historical.latestDate}</span>
                )}
              </span>
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
            
            {data && chartMode === "timeseries" && (
              <div style={{ marginBottom: "20px", padding: "16px", backgroundColor: "#f5f7fa", borderRadius: "8px", border: "1px solid #e0e7ff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <label style={{ fontWeight: "700", fontSize: "14px", color: "#1f2937" }}>📊 Select Pollutants to Display:</label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={handleSelectAll} style={{ padding: "6px 12px", fontSize: "12px", backgroundColor: "#10b981", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "600" }}>All</button>
                    <button onClick={handleDeselectAll} style={{ padding: "6px 12px", fontSize: "12px", backgroundColor: "#ef4444", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "600" }}>None</button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "10px" }}>
                  {pollutants.map(pollutant => (
                    <label key={pollutant} style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      gap: "8px", 
                      cursor: "pointer",
                      padding: "10px",
                      backgroundColor: selectedPollutants.includes(pollutant) ? "#dbeafe" : "#f9fafb",
                      border: `2px solid ${selectedPollutants.includes(pollutant) ? "#3b82f6" : "#e5e7eb"}`,
                      borderRadius: "6px",
                      transition: "all 0.2s",
                      userSelect: "none"
                    }}>
                      <div style={{
                        width: "14px",
                        height: "14px",
                        borderRadius: "3px",
                        backgroundColor: pollutantColors[pollutant] || "#9ca3af",
                        opacity: selectedPollutants.includes(pollutant) ? 1 : 0.4,
                        transition: "opacity 0.2s"
                      }} />
                      <input
                        type="checkbox"
                        checked={selectedPollutants.includes(pollutant)}
                        onChange={() => handlePollutantToggle(pollutant)}
                        style={{ cursor: "pointer", width: "16px", height: "16px" }}
                      />
                      <span style={{ fontSize: "13px", fontWeight: "500", color: selectedPollutants.includes(pollutant) ? "#1f2937" : "#6b7280" }}>{pollutant}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

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
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="pollutant" label={{ value: "Pollutant", position: "insideBottom", offset: -5 }} />
                    <YAxis label={{ value: "Value", angle: -90, position: "insideLeft" }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="value" fill="#4f8df6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {data && !isLoading && chartMode === "timeseries" && (
              <div style={{ width: "100%", marginTop: "20px" }} className="fade-in">
                <div className="chart-scroll-shell">
                  <div className="charts-row">
                  {pollutants.map((pollutant) => {
                    if (!selectedPollutants.includes(pollutant)) return null;

                    // Extract data for this pollutant
                    const pollutantData = timeSeries.map(point => ({
                      time: point.time,
                      value: point[pollutant]
                    })).filter(d => d.value !== undefined);

                    if (pollutantData.length === 0) return null;

                    return (
                      <div key={pollutant} className="chart-card">
                        <h4 className="chart-card-title">
                          <div className="chart-color-square" style={{ backgroundColor: pollutantColors[pollutant] || "#9ca3af" }} />
                          {pollutant}
                        </h4>
                        <ResponsiveContainer width="100%" height={260}>
                          <LineChart data={pollutantData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis 
                              dataKey="time" 
                              tick={{ fontSize: 10 }}
                              interval="preserveStartEnd"
                              minTickGap={28}
                              angle={-35}
                              textAnchor="end"
                              height={52}
                              tickFormatter={(value) => {
                                const parts = String(value).split(" ");
                                if (parts.length >= 2) {
                                  return `${parts[0].slice(5)} ${parts[1].slice(0, 5)}`;
                                }
                                return String(value).slice(5, 16);
                              }}
                              label={{ value: "Time", position: "insideBottom", offset: -10 }}
                            />
                            <YAxis 
                              tick={{ fontSize: 11 }}
                              width={45}
                              tickLine={false}
                              axisLine={{ stroke: '#cbd5e1' }}
                              tickFormatter={(value) => Number(value).toFixed(0)}
                              label={{ value: "Value", angle: -90, position: "insideLeft" }}
                            />
                            <Tooltip 
                              formatter={(value) => value.toFixed(2)}
                              contentStyle={{ backgroundColor: "#f9fafb", border: "1px solid #e2e8f0", borderRadius: "4px" }}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="value" 
                              stroke={pollutantColors[pollutant] || "#9ca3af"}
                              dot={false}
                              strokeWidth={2}
                              isAnimationActive={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })}
                  </div>
                </div>
              </div>
            )}

            {data && (
              <div style={{marginTop: "16px", padding: "12px", backgroundColor: "#f0f8ff", borderRadius: "5px"}}>
                <strong>Location:</strong> {data.measurements?.[0]?.location || data.city || 'Unknown Location'}
                <div style={{fontSize: "12px", color: "#666", marginTop: "6px"}}>
                  {(() => {
                    let dateInfo = "";

                    if (hasDateFilters) {
                      dateInfo = `📅 ${filterLabel}`;
                    } else {
                      const latestDate = data.latestUpdated || getLatestTimestamp(data.measurements);
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

                    const locationStr = data.measurements?.[0]?.location || '';
                    let coordsInfo = '';

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

        
        </div>

        {/* AI Advice placed between charts and table (full-width) */}
        <div className="advice-wrapper">
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
            <div className="advice fade-in" style={{ width: '100%' }}>
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
              <p style={{ margin: 0 }}>{advice.text}</p>
            </div>
          )}
          {error && <p className="error">{error}</p>}
        </div>

        {/* Full-width Data Table Section */}
        {data && (
          <div className="table-section">
            <h3>{tableTitleLabel}</h3>
            <table>
              <thead>
                <tr><th>Pollutant</th><th>Value</th><th>Unit</th><th>{tableTimestampLabel}</th><th>WHO Status</th></tr>
              </thead>
              <tbody>
                {tableRows.map((row, i) => {
                  const isNotAvailable = row.notAvailable === true;
                  const whoStatus = isNotAvailable ? { status: "N/A", color: "#999", emoji: "—" } : getWHOStatus(row.pollutant, row.value, row.unit);
                  const actualUnit = isNotAvailable ? "—" : getActualUnit(row.pollutant, row.unit);
                  const latestUpdated = isNotAvailable ? null : (row.latestUpdated || data.latestUpdated || getLatestTimestamp(data.measurements));
                  return (
                    <tr
                      key={i}
                      tabIndex={0}
                      style={{opacity: isNotAvailable ? 0.6 : 1}}
                    >
                      <td className="pollutant-cell">
                        <span className="pollutant-name">{row.pollutant}</span>
                        <div className="pollutant-details-tooltip">
                          <span className="tooltip-title">{getPollutantDetails(row.pollutant).name}</span>
                          <span className="tooltip-description">{getPollutantDetails(row.pollutant).description}</span>
                          <span className="tooltip-section">
                            <span className="tooltip-label">WHO:</span> {getPollutantDetails(row.pollutant).whoAdvice}
                          </span>
                          <span className="tooltip-section">
                            <span className="tooltip-label">Safety:</span> {getPollutantDetails(row.pollutant).safetyAdvice}
                          </span>
                        </div>
                      </td>
                      <td>{isNotAvailable ? "Not available" : row.value}</td>
                      <td>{actualUnit}</td>
                      <td>{latestUpdated ? new Date(latestUpdated).toLocaleString() : (isNotAvailable ? "—" : "")}</td>
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
      <button
        type="button"
        className="assistant-fab"
        onClick={() => setAssistantOpen(prev => !prev)}
        aria-label="Open AI assistant"
      >
        <span className="assistant-fab-icon">🤖</span>
        <span className="assistant-fab-text">AI Assist</span>
      </button>

      {assistantOpen && (
        <div className="assistant-panel" role="dialog" aria-label="AI assistant">
          <div className="assistant-panel-header">
            <div>
              <div className="assistant-panel-title">BreatheSmart AI Assistant</div>
              <div className="assistant-panel-subtitle">General and app-related questions</div>
            </div>
            <button
              type="button"
              className="assistant-close-btn"
              onClick={() => setAssistantOpen(false)}
              aria-label="Close assistant"
            >
              ×
            </button>
          </div>

          {/* Model & Provider Controls */}
          <div className="assistant-controls">
            <div className="control-group">
              <label>Provider:</label>
              <select 
                value={assistantProvider} 
                onChange={e => setAssistantProvider(e.target.value)}
                disabled={assistantLoading}
              >
                <option value="openrouter">OpenRouter</option>
                <option value="rule-based">Rule-based</option>
              </select>
            </div>

            {assistantProvider === 'openrouter' && (
              <div className="control-group">
                <label>Model:</label>
                <select 
                  value={assistantModel} 
                  onChange={e => setAssistantModel(e.target.value)}
                  disabled={assistantLoading}
                >
                  <option value="gpt-4o-mini">GPT-4o Mini</option>
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                  <option value="llama-3.3-70b-versatile">Llama 3.3 70B</option>
                </select>
              </div>
            )}

            <div className="control-group">
              <label>Mode:</label>
              <div className="mode-toggle">
                <button
                  className={`mode-btn ${assistantMode === 'general' ? 'active' : ''}`}
                  onClick={() => setAssistantMode('general')}
                  disabled={assistantLoading}
                  title="General knowledge and questions"
                >
                  General
                </button>
                <button
                  className={`mode-btn ${assistantMode === 'app' ? 'active' : ''}`}
                  onClick={() => setAssistantMode('app')}
                  disabled={assistantLoading}
                  title="App-specific features"
                >
                  App
                </button>
                <button
                  className={`mode-btn ${assistantMode === 'both' ? 'active' : ''}`}
                  onClick={() => setAssistantMode('both')}
                  disabled={assistantLoading}
                  title="Both general and app queries"
                >
                  Both
                </button>
              </div>
            </div>
          </div>

          <div className="assistant-messages">
            {assistantMessages.map((message, index) => (
              <div key={index} className={`assistant-message ${message.role}`}>
                <div className="assistant-message-bubble">
                  <p>{message.content}</p>
                  {message.source && <span className="assistant-message-source">{message.source}</span>}
                </div>
              </div>
            ))}
            {assistantLoading && <div className="assistant-loading">Thinking...</div>}
          </div>

          <div className="assistant-input-row">
            <textarea
              value={assistantInput}
              onChange={e => setAssistantInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAssistantSend();
                }
              }}
              placeholder="Ask a question about the app or air quality..."
              rows={3}
            />
            <button type="button" onClick={handleAssistantSend} disabled={assistantLoading || !assistantInput.trim()}>
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;