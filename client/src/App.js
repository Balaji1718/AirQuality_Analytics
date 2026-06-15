import React, { useState } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import {
  ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line
} from "recharts";
import "./App.css";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || (process.env.NODE_ENV === "production" ? "" : "http://localhost:5000");
const apiClient = axios.create({
  baseURL: API_BASE_URL
});
const ENABLE_HIERARCHY_COUNTRY_DROPDOWN = process.env.REACT_APP_ENABLE_HIERARCHY_COUNTRY !== "false";
const ENABLE_HIERARCHY_STATE_DROPDOWN = ENABLE_HIERARCHY_COUNTRY_DROPDOWN && process.env.REACT_APP_ENABLE_HIERARCHY_STATE !== "false";
const ENABLE_HIERARCHY_CITY_DROPDOWN = ENABLE_HIERARCHY_STATE_DROPDOWN && process.env.REACT_APP_ENABLE_HIERARCHY_CITY !== "false";

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

// Format timestamp strings to DD/MM/YYYY HH:MM format
function formatTimestamp(ts) {
  if (!ts) return "-";
  if (ts === "N/A" || ts === "Latest") return ts;
  
  const pad = (n) => String(n).padStart(2, '0');
  
  try {
    // Accept already-short labels
    if (typeof ts !== 'string') ts = String(ts);

    // Common bucket formats created by bucketBy: "YYYY-MM-DD HH:00", "YYYY-MM-DD", "YYYY-MM"
    const ymdHour = /^\d{4}-\d{2}-\d{2} \d{2}:00$/;
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    const ym = /^\d{4}-\d{2}$/;

    if (ymdHour.test(ts)) {
      const parts = ts.split(' ');
      const dateParts = parts[0].split('-');
      const timeParts = parts[1].split(':');
      const day = dateParts[2];
      const month = dateParts[1];
      const year = dateParts[0];
      const hour = timeParts[0];
      return `${day}/${month}/${year} ${hour}:00`;
    }
    if (ymd.test(ts)) {
      const parts = ts.split('-');
      const day = parts[2];
      const month = parts[1];
      const year = parts[0];
      return `${day}/${month}/${year}`;
    }
    if (ym.test(ts)) {
      const parts = ts.split('-');
      const month = parts[1];
      const year = parts[0];
      return `01/${month}/${year}`;
    }

    // Fallback: try parsing ISO or other date strings
    const d = new Date(ts);
    if (!isNaN(d)) {
      const day = pad(d.getUTCDate());
      const month = pad(d.getUTCMonth() + 1);
      const year = d.getUTCFullYear();
      const hour = pad(d.getUTCHours());
      const minute = pad(d.getUTCMinutes());
      
      // If time component is midnight, show date only
      if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
        return `${day}/${month}/${year}`;
      }
      return `${day}/${month}/${year} ${hour}:${minute}`;
    }
  } catch (e) {
    // ignore and fall through
  }
  return ts; // last resort
}

// Formatter used by chart XAxis ticks and tooltip labels
function formatTick(value) {
  if (!value && value !== 0) return '';
  if (value === 'Latest') return 'Latest';
  return formatTimestamp(value);
}

function App() {
  const [city, setCity] = useState("");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState([]);
  const [fromYear, setFromYear] = useState("");
  const [toYear, setToYear] = useState("");
  const [fromMonth, setFromMonth] = useState("");
  const [toMonth, setToMonth] = useState("");
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");
  const [fromHour, setFromHour] = useState("");
  const [toHour, setToHour] = useState("");
  const [data, setData] = useState(null);
  const [notice, setNotice] = useState("");
  const [chartMode, setChartMode] = useState("snapshot");
  const [advice, setAdvice] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [globalCountries, setGlobalCountries] = useState([]);
  const [hierarchyCountries, setHierarchyCountries] = useState([]);
  const [selectedHierarchyCountry, setSelectedHierarchyCountry] = useState("");
  const [hierarchyCountriesLoading, setHierarchyCountriesLoading] = useState(false);
  const [hierarchyCountriesError, setHierarchyCountriesError] = useState("");
  const [hierarchyStates, setHierarchyStates] = useState([]);
  const [selectedHierarchyState, setSelectedHierarchyState] = useState("");
  const [hierarchyStatesLoading, setHierarchyStatesLoading] = useState(false);
  const [hierarchyStatesError, setHierarchyStatesError] = useState("");
  const [hierarchyCities, setHierarchyCities] = useState([]);
  const [selectedHierarchyCity, setSelectedHierarchyCity] = useState("");
  const [hierarchyCitiesLoading, setHierarchyCitiesLoading] = useState(false);
  const [hierarchyCitiesError, setHierarchyCitiesError] = useState("");
  const [hierarchyTelemetry, setHierarchyTelemetry] = useState({
    countries: { success: 0, failure: 0 },
    states: { success: 0, failure: 0 },
    cities: { success: 0, failure: 0 }
  });
  const [statusBanners, setStatusBanners] = useState({ historical: null, liveMonitoring: null });
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState([
    {
      role: "assistant",
      content: "Ask me anything general or app-related about air quality trends, filters, and health recommendations.",
      source: "BreatheSmart Assistant"
    }
  ]);
  const availablePollutants = ["PM25", "PM10", "NO2", "SO2", "O3", "CO", "T", "H", "NO", "P", "NH3"];
  const [selectedPollutants, setSelectedPollutants] = useState(["PM10", "NO2", "O3"]);
  const [hoveredPollutant, setHoveredPollutant] = useState(null);

  // Fetch status banners on page load
  React.useEffect(() => {
    const fetchStatusBanners = async () => {
      try {
        // Fetch historical data availability
        const historicalRes = await apiClient.get("/api/data-availability");
        const historicalData = historicalRes.data;
        
        // Fetch live monitoring status
        const liveRes = await apiClient.get("/api/collection-status");
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

  // Load global countries database on mount
  React.useEffect(() => {
    const loadCountries = async () => {
      try {
        const response = await apiClient.get("/api/countries");
        if (response.data.countries) {
            setGlobalCountries(response.data.countries);
          console.log(`✅ Loaded ${response.data.countries.length} countries globally`);
        }
      } catch (err) {
        console.error("Failed to load countries:", err);
        // Set empty array as fallback - API will still work for any country name
        setGlobalCountries([]);
      }
    };
    loadCountries();
  }, []);

  React.useEffect(() => {
    const trimmedCity = (city || "").trim();
    if (trimmedCity.length < 1) {
      setAutocompleteSuggestions([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      try {
        const response = await apiClient.get("/api/hierarchy/search", {
          params: {
            q: trimmedCity,
            country: selectedHierarchyCountry || null,
            state: selectedHierarchyState || null,
            limit: 15
          }
        });
        
        const suggestionsList = (response.data?.results || []).map(item => {
          if (item.type === 'city') {
            return item.state && item.state !== 'General Region'
              ? `${item.name}, ${item.state}, ${item.country}`
              : `${item.name}, ${item.country}`;
          }
          if (item.type === 'state') {
            return `${item.name}, ${item.country}`;
          }
          return item.name;
        });
        
        setAutocompleteSuggestions(Array.from(new Set(suggestionsList)));
      } catch (err) {
        console.error("Autocomplete search error:", err);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [city, selectedHierarchyCountry, selectedHierarchyState]);

  React.useEffect(() => {
    const loadHierarchyCountries = async () => {
      if (!ENABLE_HIERARCHY_COUNTRY_DROPDOWN) {
        return;
      }

      try {
        setHierarchyCountriesLoading(true);
        setHierarchyCountriesError("");
        const response = await apiClient.get("/api/hierarchy/countries", {
          params: {
            limit: 1000,
            offset: 0
          }
        });

        const countries = Array.isArray(response.data?.countries) ? response.data.countries : [];
        const names = Array.from(new Set(countries
          .map(country => (typeof country === "string" ? country : country?.name))
          .filter(Boolean)))
          .sort((a, b) => a.localeCompare(b));
        setHierarchyCountries(names);
      } catch (err) {
        console.error("Failed to load hierarchy countries:", err);
        setHierarchyCountries([]);
        setHierarchyCountriesError("Hierarchy countries are temporarily unavailable. Manual search remains active.");
      } finally {
        setHierarchyCountriesLoading(false);
      }
    };

    loadHierarchyCountries();
  }, []);

  React.useEffect(() => {
    const loadHierarchyStates = async () => {
      if (!ENABLE_HIERARCHY_STATE_DROPDOWN) {
        return;
      }

      if (!selectedHierarchyCountry) {
        setHierarchyStates([]);
        setSelectedHierarchyState("");
        setHierarchyStatesError("");
        return;
      }

      try {
        setHierarchyStatesLoading(true);
        setHierarchyStatesError("");
        const response = await apiClient.get(`/api/hierarchy/countries/${encodeURIComponent(selectedHierarchyCountry)}/states`, {
          params: {
            limit: 1000,
            offset: 0
          }
        });

        const states = Array.isArray(response.data?.states) ? response.data.states : [];
        const names = Array.from(new Set(states
          .map(state => (typeof state === "string" ? state : state?.name))
          .filter(Boolean)))
          .sort((a, b) => a.localeCompare(b));

        setHierarchyStates(names);
        setHierarchyTelemetry(prev => ({ ...prev, states: { ...prev.states, success: prev.states.success + 1 } }));
        setSelectedHierarchyState("");
      } catch (err) {
        console.error("Failed to load hierarchy states:", err);
        setHierarchyStates([]);
        setSelectedHierarchyState("");
        setHierarchyStatesError("State options are temporarily unavailable. Manual search remains active.");
        setHierarchyTelemetry(prev => ({ ...prev, states: { ...prev.states, failure: prev.states.failure + 1 } }));
      } finally {
        setHierarchyStatesLoading(false);
      }
    };

    loadHierarchyStates();
  }, [selectedHierarchyCountry]);

  // Log telemetry updates (non-invasive) so we can observe load success/failure counts.
  React.useEffect(() => {
    console.debug('Hierarchy telemetry update:', hierarchyTelemetry);
  }, [hierarchyTelemetry]);

  React.useEffect(() => {
    const loadHierarchyCities = async () => {
      if (!ENABLE_HIERARCHY_CITY_DROPDOWN) return;

      if (!selectedHierarchyCountry || !selectedHierarchyState) {
        setHierarchyCities([]);
        setSelectedHierarchyCity("");
        setHierarchyCitiesError("");
        return;
      }

      try {
        setHierarchyCitiesLoading(true);
        setHierarchyCitiesError("");
        const response = await apiClient.get(`/api/hierarchy/countries/${encodeURIComponent(selectedHierarchyCountry)}/states/${encodeURIComponent(selectedHierarchyState)}/cities`, {
          params: { limit: 2000, offset: 0 }
        });

        const cities = Array.isArray(response.data?.cities) ? response.data.cities : [];
        const names = Array.from(new Set(cities
          .map(c => (typeof c === "string" ? c : c?.name))
          .filter(Boolean))).sort((a, b) => a.localeCompare(b));

        setHierarchyCities(names);
        setSelectedHierarchyCity("");
        setHierarchyTelemetry(prev => ({ ...prev, cities: { ...prev.cities, success: prev.cities.success + 1 } }));
      } catch (err) {
        console.error("Failed to load hierarchy cities:", err);
        setHierarchyCities([]);
        setSelectedHierarchyCity("");
        setHierarchyCitiesError("City options are temporarily unavailable. Manual search remains active.");
        setHierarchyTelemetry(prev => ({ ...prev, cities: { ...prev.cities, failure: prev.cities.failure + 1 } }));
      } finally {
        setHierarchyCitiesLoading(false);
      }
    };

    loadHierarchyCities();
  }, [selectedHierarchyState, selectedHierarchyCountry]);

  const handleShow = async () => {
    try {
      setError("");
      setNotice("");
      setAdvice(null);
      setData(null);
      setIsLoading(true);
      // Build final city value using single hierarchy selection (only one choice honored)
      let finalCity = city && city.trim() ? city.trim() : null;
      if (selectedHierarchyCity) {
        finalCity = selectedHierarchyCity;
      } else if (selectedHierarchyState) {
        finalCity = selectedHierarchyState;
      } else if (selectedHierarchyCountry) {
        finalCity = selectedHierarchyCountry;
      }

      if (!finalCity) {
        setError("Please enter a city or select a location");
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
        city: finalCity,
        // include explicit hierarchy overrides to help backend resolution
        country: selectedHierarchyCountry || null,
        state: selectedHierarchyState || null,
        fromYear: validFromYear,
        toYear: validToYear,
        fromMonth: validFromMonth,
        toMonth: validToMonth,
        fromDay: validFromDay,
        toDay: validToDay,
        fromHour: validFromHour,
        toHour: validToHour
      };

      const res = await apiClient.post("/api/hybrid-measurements", body);
      const payload = res.data;
      
      // Validate response data
      if (!payload) {
        setError("No data received from server");
        setIsLoading(false);
        return;
      }

      if (payload.empty) {
        const emptyResults = Array.isArray(payload.results) ? payload.results : [];
        const emptySnapshot = Array.isArray(payload.snapshot) ? payload.snapshot : [];
        setNotice(payload.fallbackMessage || payload.message || "No air quality data available for the selected location.");
        // extract first available coordinates from results for map link
        const firstCoord = (emptyResults || []).find(r => Array.isArray(r.coordinates) || (r && r.coordinates && r.coordinates.latitude)) || null;
        let resolvedCoordinates = payload.resolvedCoordinates || null;
        if (firstCoord) {
          if (Array.isArray(firstCoord.coordinates)) {
            resolvedCoordinates = { lat: firstCoord.coordinates[0], lon: firstCoord.coordinates[1] };
          } else if (firstCoord.coordinates && firstCoord.coordinates.latitude) {
            resolvedCoordinates = { lat: firstCoord.coordinates.latitude, lon: firstCoord.coordinates.longitude };
          }
        }

        setData({
          city: payload.city,
          resolvedLocation: payload.resolvedLocation || payload.city,
          resolvedCoordinates,
          providerLocation: payload.providerLocation || emptyResults[0]?.providerLocation || null,
          stationMetadata: payload.stationMetadata || emptyResults[0]?.stationMetadata || null,
          searchContext: payload.searchContext || null,
          empty: true,
          emptyMessage: payload.fallbackMessage || payload.message || "No air quality data available.",
          snapshot: emptySnapshot,
          measurements: emptyResults,
          results: emptyResults,
          from: payload.from,
          to: payload.to,
          apiInfo: payload.apiInfo || null,
          totalResults: 0,
          validResults: 0
        });
        setAdvice({
          text: payload.suggestion || "Try a nearby major city, the country name, or check back later when more stations are available.",
          source: "Fallback Advisory",
          isAI: false
        });
        setChartMode("snapshot");
        setIsLoading(false);
        return;
      }

      if (!payload.results || !Array.isArray(payload.results) || payload.results.length === 0) {
        setError("No air quality measurements found for the specified location and time range. Try a country, region/state, or local area.");
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

      // try to find a representative coordinate from results
      const firstCoordNonEmpty = (payload.results || payload.measurements || []).find(r => Array.isArray(r.coordinates) || (r && r.coordinates && r.coordinates.latitude)) || null;
      let resolvedCoordinatesNonEmpty = payload.resolvedCoordinates || null;
      if (firstCoordNonEmpty) {
        if (Array.isArray(firstCoordNonEmpty.coordinates)) {
          resolvedCoordinatesNonEmpty = { lat: firstCoordNonEmpty.coordinates[0], lon: firstCoordNonEmpty.coordinates[1] };
        } else if (firstCoordNonEmpty.coordinates && firstCoordNonEmpty.coordinates.latitude) {
          resolvedCoordinatesNonEmpty = { lat: firstCoordNonEmpty.coordinates.latitude, lon: firstCoordNonEmpty.coordinates.longitude };
        }
      }

      setData({ 
        city: payload.city,
        resolvedLocation: payload.resolvedLocation || payload.city,
        resolvedCoordinates: resolvedCoordinatesNonEmpty,
        providerLocation: payload.providerLocation || validResults[0]?.providerLocation || null,
        stationMetadata: payload.stationMetadata || validResults[0]?.stationMetadata || null,
        searchContext: payload.searchContext || null,
        empty: false,
        snapshot, 
        measurements: validResults,
        results: validResults, // Add results for chart compatibility
        from: payload.from, 
        to: payload.to,
        apiInfo: payload.apiInfo,
        totalResults: payload.results.length,
        validResults: validResults.length
      });
      // Set chart mode based on filter complexity
      const hasDateFilters = body.fromYear || body.toYear || body.fromMonth || body.toMonth || body.fromDay || body.toDay || body.fromHour || body.toHour;
      if (hasDateFilters) {
        setChartMode("timeseries");
      } else {
        setChartMode("snapshot");
      }

      try {
        // Use filtered/valid results for advice generation
        const adviceRes = await apiClient.post("/api/insights", { city: payload.city, data: validResults });
        const adviceSource = adviceRes.data.source || "Health Advisory System";
        setAdvice({
          text: adviceRes.data.insights || "",
          source: adviceSource,
          isAI: /Groq|OpenRouter|OpenAI|AI/i.test(adviceSource)
        });
      } catch (err) {
        console.error("Advice generation failed:", err.message);
        setAdvice({
          text: `Air quality data is available for ${payload.city}, but advice generation is currently unavailable. Please use general outdoor precautions and check official alerts.`,
          source: "Fallback Advisory",
          isAI: false
        });
      }
      setIsLoading(false);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to fetch data");
      setNotice("");
      setIsLoading(false);
    }
  };

  const handleAssistantSend = async () => {
    const question = assistantInput.trim();
    if (!question || assistantLoading) {
      return;
    }

    const hasDateFilters = Boolean(fromYear || toYear || fromMonth || toMonth || fromDay || toDay || fromHour || toHour);
    const assistantContext = {
      city: city || data?.city || "",
      hasData: Boolean(data),
      hasDateFilters,
      chartMode,
      selectedPollutants,
      recordCount: data?.totalResults || data?.validResults || 0,
      filters: {
        fromYear,
        toYear,
        fromMonth,
        toMonth,
        fromDay,
        toDay,
        fromHour,
        toHour
      }
    };

    setAssistantMessages(previous => [...previous, { role: "user", content: question }]);
    setAssistantInput("");
    setAssistantLoading(true);

    try {
      const response = await apiClient.post("/api/assistant", {
        question,
        appContext: assistantContext
      });

      setAssistantMessages(previous => [...previous, {
        role: "assistant",
        content: response.data?.answer || "I could not generate a response right now.",
        source: response.data?.source || "BreatheSmart Assistant"
      }]);
    } catch (err) {
      setAssistantMessages(previous => [...previous, {
        role: "assistant",
        content: "Unable to reach the assistant at the moment. Please try again.",
        source: "BreatheSmart Assistant"
      }]);
    } finally {
      setAssistantLoading(false);
    }
  };

  // Dynamic snapshot that updates based on current data and filters
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
  })() : [];

  const hasDateFilters = Boolean(fromYear || toYear || fromMonth || toMonth || fromDay || toDay || fromHour || toHour);
  const filterSummaryParts = [
    fromYear || toYear ? `Years ${fromYear || "Any"}-${toYear || "Any"}` : "",
    fromMonth || toMonth ? `Months ${fromMonth || "Any"}-${toMonth || "Any"}` : "",
    fromDay || toDay ? `Days ${fromDay || "Any"}-${toDay || "Any"}` : "",
    fromHour || toHour ? `Hours ${fromHour || "Any"}-${toHour || "Any"}` : ""
  ].filter(Boolean);
  const tableTimelineHeader = hasDateFilters
    ? `Data from filters${filterSummaryParts.length ? ` (${filterSummaryParts.join(" • ")})` : ""}`
    : "Current Data";
  const visiblePollutants = selectedPollutants.length ? selectedPollutants : availablePollutants;
  const snapshotLookup = new Map(snapshotSeries.map(item => [item.pollutant, item]));
  
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
  })() : [];
  
  // Build lookup for filtered data from timeSeries (when filters are active)
  const filteredDataLookup = new Map();
  if (hasDateFilters && timeSeries.length > 0) {
    visiblePollutants.forEach(pollutant => {
      // Get all data points for this pollutant from filtered timeSeries
      const dataPoints = timeSeries
        .filter(point => typeof point[pollutant] === "number")
        .map(point => ({
          value: point[pollutant],
          time: point.time
        }));
      
      if (dataPoints.length > 0) {
        // Use the last (most recent) data point from the filtered range
        const lastPoint = dataPoints[dataPoints.length - 1];
        const avgValue = dataPoints.reduce((sum, p) => sum + p.value, 0) / dataPoints.length;
        
        filteredDataLookup.set(pollutant, {
          value: lastPoint.value,
          avgValue: avgValue,
          time: lastPoint.time,
          count: dataPoints.length
        });
      }
    });
  }
  
  const getTableRowForPollutant = pollutant => {
    const originalMeasurement = data?.measurements?.find(m => m.pollutant?.toUpperCase() === pollutant) || null;
    
    // If filters are active and we have filtered data, use it
    if (hasDateFilters && filteredDataLookup.has(pollutant)) {
      const filteredRow = filteredDataLookup.get(pollutant);
      return {
        pollutant,
        snapshotRow: null,
        originalMeasurement,
        value: filteredRow.value ?? "N/A",
        unit: originalMeasurement ? getActualUnit(pollutant, originalMeasurement.unit) : "N/A",
        timeline: filteredRow.time ?? "N/A",
        status: getWHOStatus(pollutant, filteredRow.value, originalMeasurement?.unit)
      };
    }
    
    // Otherwise use snapshot (current data)
    const snapshotRow = snapshotLookup.get(pollutant) || null;
    return {
      pollutant,
      snapshotRow,
      originalMeasurement,
      value: snapshotRow?.value ?? "N/A",
      unit: snapshotRow ? getActualUnit(pollutant, snapshotRow.unit) : "N/A",
      timeline: snapshotRow ? (snapshotRow.dateLocal || snapshotRow.dateUTC || originalMeasurement?.dateLocal || originalMeasurement?.dateUTC || "N/A") : "N/A",
      status: snapshotRow ? getWHOStatus(pollutant, snapshotRow.value, snapshotRow.unit) : null
    };
  };

  const togglePollutant = pollutant => {
    setSelectedPollutants(prev => (
      prev.includes(pollutant)
        ? prev.filter(p => p !== pollutant)
        : [...prev, pollutant]
    ));
  };

  const selectAllPollutants = () => {
    setSelectedPollutants([...availablePollutants]);
  };

  const clearAllPollutants = () => {
    setSelectedPollutants([]);
  };

  const getPollutantChartData = pollutant => {
    const series = timeSeries
      .filter(point => typeof point[pollutant] === "number")
      .map(point => ({ time: point.time, value: point[pollutant] }));

    if (series.length > 0) {
      return series;
    }

    const latest = snapshotSeries.find(s => s.pollutant === pollutant);
    return latest ? [{ time: "Latest", value: latest.value }] : [];
  };

  const chartCards = visiblePollutants
    .map(pollutant => {
      const seriesData = getPollutantChartData(pollutant);
      if (!seriesData.length) {
        return null;
      }

      return { pollutant, seriesData };
    })
    .filter(Boolean);

  const pollutantChartColors = {
    PM25: "#6366f1",
    PM10: "#22c55e",
    NO2: "#f97316",
    SO2: "#94a3b8",
    O3: "#f59e0b",
    CO: "#64748b",
    T: "#ef4444",
    H: "#0ea5e9",
    NO: "#8b5cf6",
    P: "#14b8a6",
    NH3: "#e11d48"
  };

  const countryOptions = Array.from(new Set(globalCountries.map(country => country.name))).sort((a, b) => a.localeCompare(b));
  const manualSearchSuggestions = (() => {
    if (selectedHierarchyCountry && selectedHierarchyState) {
      return Array.from(new Set(hierarchyCities.filter(Boolean))).sort((a, b) => a.localeCompare(b));
    }

    if (selectedHierarchyCountry) {
      return Array.from(new Set([
        selectedHierarchyCountry,
        ...hierarchyStates.filter(Boolean)
      ])).sort((a, b) => a.localeCompare(b));
    }

    return countryOptions;
  })();

  const displaySuggestions = city && city.trim() ? autocompleteSuggestions : manualSearchSuggestions;

  const handleHierarchyCountryChange = event => {
    const nextCountry = event.target.value;
    setSelectedHierarchyCountry(nextCountry);
    // Clear state and city selections to enforce single-choice search
    setSelectedHierarchyState("");
    setHierarchyStates([]);
    setSelectedHierarchyCity("");
    setHierarchyCities([]);
    setHierarchyStatesError("");
    // telemetry for country load triggered from initial load effect
    setHierarchyTelemetry(prev => ({ ...prev, countries: { ...prev.countries, success: prev.countries.success } }));

    // Keep the selector optional: only copy into manual input when explicitly selected.
    if (nextCountry) {
      setCity(nextCountry);
    }
  };

  const handleHierarchyStateChange = event => {
    const nextState = event.target.value;
    // Set the state, clear any selected city to enforce single-choice
    setSelectedHierarchyState(nextState);
    setSelectedHierarchyCity("");
    setHierarchyCities([]);

    // Keep the selector optional: copy into manual input when explicitly selected.
    if (nextState) {
      // Use state name as single search term (country remains for context)
      setCity(nextState);
    }
  };

  const handleHierarchyCityChange = event => {
    const nextCity = event.target.value;
    setSelectedHierarchyCity(nextCity);

    if (nextCity) {
      setCity(nextCity);
    }
  };

  return (
    <div className="main-container">
      {/* Header Section - Centered title and search */}
      <div className="header-section">
        <h1 className="main-title">Air Quality Analytics</h1>
        <div className="search-container">
          <div className="search-bar-primary">
            <input 
              placeholder="Enter city or country (e.g. Delhi, India)" 
              value={city} 
              list="country-suggestions"
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
            <button 
              type="button"
              className={`advanced-filters-toggle-btn ${advancedFiltersOpen ? 'active' : ''}`}
              onClick={() => setAdvancedFiltersOpen(!advancedFiltersOpen)}
            >
              ⚙️ {advancedFiltersOpen ? "Hide Filters" : "Advanced Filters"}
            </button>
          </div>

          {advancedFiltersOpen && (
            <div className="advanced-filters-drawer">
              <div className="filter-select-group">
                {ENABLE_HIERARCHY_COUNTRY_DROPDOWN && (
                  <div className="filter-select-item">
                    <label>Country Filter</label>
                    <select
                      className="hierarchy-country-select"
                      value={selectedHierarchyCountry}
                      onChange={handleHierarchyCountryChange}
                      disabled={hierarchyCountriesLoading}
                    >
                      <option value="">Select country (optional)</option>
                      {hierarchyCountries.map(countryName => (
                        <option key={countryName} value={countryName}>{countryName}</option>
                      ))}
                    </select>
                  </div>
                )}
                {ENABLE_HIERARCHY_STATE_DROPDOWN && (
                  <div className="filter-select-item">
                    <label>State/Region Filter</label>
                    <select
                      className="hierarchy-state-select"
                      value={selectedHierarchyState}
                      onChange={handleHierarchyStateChange}
                      disabled={!selectedHierarchyCountry || hierarchyStatesLoading}
                    >
                      <option value="">Select state/region (optional)</option>
                      {hierarchyStates.map(stateName => (
                        <option key={stateName} value={stateName}>{stateName}</option>
                      ))}
                    </select>
                  </div>
                )}
                {ENABLE_HIERARCHY_CITY_DROPDOWN && (
                  <div className="filter-select-item">
                    <label>City Filter</label>
                    <select
                      className="hierarchy-city-select"
                      value={selectedHierarchyCity}
                      onChange={handleHierarchyCityChange}
                      disabled={!selectedHierarchyState || hierarchyCitiesLoading}
                    >
                      <option value="">Select city (optional)</option>
                      {hierarchyCities.map(cityName => (
                        <option key={cityName} value={cityName}>{cityName}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          <datalist id="country-suggestions">
            {displaySuggestions.map(suggestion => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </div>
        {ENABLE_HIERARCHY_COUNTRY_DROPDOWN && (
          <div style={{ marginTop: "8px", fontSize: "12px", color: "#64748b" }}>
            {hierarchyCountriesLoading
              ? "Loading supported countries from hierarchy API..."
              : hierarchyCountriesError || `Hierarchy countries loaded: ${hierarchyCountries.length}.`}
          </div>
        )}
        {ENABLE_HIERARCHY_STATE_DROPDOWN && selectedHierarchyCountry && (
          <div style={{ marginTop: "4px", fontSize: "12px", color: "#64748b" }}>
            {hierarchyStatesLoading
              ? `Loading states for ${selectedHierarchyCountry}...`
              : hierarchyStatesError || `States loaded for ${selectedHierarchyCountry}: ${hierarchyStates.length}.`}
          </div>
        )}
        {ENABLE_HIERARCHY_CITY_DROPDOWN && selectedHierarchyState && (
          <div style={{ marginTop: "4px", fontSize: "12px", color: "#64748b" }}>
            {hierarchyCitiesLoading
              ? `Loading cities for ${selectedHierarchyState}...`
              : hierarchyCitiesError || `Cities loaded for ${selectedHierarchyState}: ${hierarchyCities.length}.`}
          </div>
        )}
        {globalCountries.length > 0 && (
          <div style={{ marginTop: "8px", fontSize: "12px", color: "#64748b" }}>
            Global country list loaded: {globalCountries.length} countries.
          </div>
        )}
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

      {/* Content Section */}
      <div className="content-section">
        <div className="chart-container">
          <h2>Pollutant Levels {data ? `in ${data.resolvedLocation || data.city}` : ""}</h2>

          {data && (
            <div className="pollutant-selector">
              <div className="pollutant-selector-title">Select Pollutants to Display:</div>
              <div className="pollutant-selector-actions">
                <button type="button" onClick={selectAllPollutants} className="selector-btn">All</button>
                <button type="button" onClick={clearAllPollutants} className="selector-btn selector-btn-danger">None</button>
              </div>
              <div className="pollutant-selector-grid">
                {availablePollutants.map(pollutant => (
                  <label key={pollutant} className={`pollutant-option ${selectedPollutants.includes(pollutant) ? "active" : ""}`}>
                    <input
                      type="checkbox"
                      checked={selectedPollutants.includes(pollutant)}
                      onChange={() => togglePollutant(pollutant)}
                    />
                    <span>{pollutant}</span>
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

          {!data && !isLoading && <p style={{ color: "gray" }}>No data yet. Enter a city or country and click Show Data.</p>}

          {data && !isLoading && (
            <div className="pollutant-card-scroll fade-in">
              <div className="pollutant-card-row">
                {chartCards.length > 0 ? chartCards.map(({ pollutant, seriesData }) => (
                  <div className="pollutant-chart-card" key={pollutant}>
                    <div className="pollutant-chart-title">{pollutant}</div>
                    <div style={{ width: "100%", height: 220 }}>
                      <ResponsiveContainer>
                        <LineChart data={seriesData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="time"
                            tick={{ fontSize: 11 }}
                            interval="preserveStartEnd"
                            label={{ value: "Timeline", position: "insideBottom", offset: -5, style: { fontSize: 11, fill: "#64748b" } }}
                            tickFormatter={formatTick}
                          />
                          <YAxis
                            tick={{ fontSize: 11 }}
                            label={{ value: "Value", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#64748b" } }}
                          />
                          <Tooltip labelFormatter={formatTick} />
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke={pollutantChartColors[pollutant] || "#4f8df6"}
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )) : (
                  <div className="chart-empty-state chart-empty-wide">No chart data available for the selected pollutants.</div>
                )}
              </div>
            </div>
          )}

          {data && (
            <div style={{ marginTop: "16px", padding: "12px", backgroundColor: "#f0f8ff", borderRadius: "5px" }}>
              <strong>Location:</strong> {data.resolvedLocation || data.measurements?.[0]?.location || data.city || "Unknown Location"}
              {data.providerLocation && data.providerLocation !== data.resolvedLocation && (
                <div style={{ fontSize: "12px", color: "#444", marginTop: "6px" }}>
                  Provider location: {data.providerLocation}
                </div>
              )}
              {/* Coordinates and map link if available */}
              {(data.resolvedCoordinates || data.measurements?.[0]?.coordinates) && (
                (() => {
                  const coords = data.resolvedCoordinates || data.measurements?.[0]?.coordinates;
                  const lat = Array.isArray(coords) ? coords[0] : coords.latitude || coords.lat;
                  const lon = Array.isArray(coords) ? coords[1] : coords.longitude || coords.lon;
                  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lat + ',' + lon)}`;
                  return (
                    <div style={{ fontSize: "12px", color: "#444", marginTop: "6px" }}>
                      Coordinates: {lat}, {lon} • <a href={mapUrl} target="_blank" rel="noreferrer">View on Google Maps</a>
                    </div>
                  );
                })()
              )}
              {data.empty && data.emptyMessage && (
                <div style={{ fontSize: "12px", color: "#8a5d00", marginTop: "6px" }}>
                  {data.emptyMessage}
                </div>
              )}
              {data.searchContext?.level && (
                <div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
                  Search level: {data.searchContext.level}
                  {data.searchContext.country ? ` • Country: ${data.searchContext.country}` : ""}
                </div>
              )}
              <div style={{ fontSize: "12px", color: "#666", marginTop: "6px" }}>
                Historical data from {data.from || "-"} to {data.to || "-"}
              </div>
            </div>
          )}
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
          {!error && notice && <p style={{ color: "#8a5d00", marginTop: "8px" }}>{notice}</p>}
        </div>

        {/* Full-width Data Table Section */}
        <div className="table-section">
          <table>
            <thead>
              <tr><th>Pollutant</th><th>Value</th><th>Unit</th><th>{tableTimelineHeader}</th><th>WHO Status</th></tr>
            </thead>
            <tbody>
              {data ? visiblePollutants.map((pollutant, i) => {
                const tableRow = getTableRowForPollutant(pollutant);
                return (
                  <tr key={pollutant} className={hoveredPollutant?.pollutant === pollutant ? "pollutant-row active" : "pollutant-row"}>
                    <td
                      className="pollutant-cell"
                      onMouseEnter={event => setHoveredPollutant({ pollutant, x: event.clientX, y: event.clientY })}
                      onMouseMove={event => setHoveredPollutant({ pollutant, x: event.clientX, y: event.clientY })}
                      onMouseLeave={() => setHoveredPollutant(null)}
                    >
                      <span className="pollutant-name">{pollutant}</span>
                      <span className="pollutant-hover-hint">Hover for details</span>
                    </td>
                    <td>{tableRow.value}</td>
                    <td>{tableRow.unit}</td>
                    <td>{formatTimestamp(tableRow.timeline)}</td>
                    <td style={{ color: tableRow.status?.color || "#64748b", fontWeight: "600" }}>
                      {tableRow.status ? <><span style={{ marginRight: "4px" }}>{tableRow.status.emoji}</span>{tableRow.status.status}</> : "N/A"}
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan="5" className="chart-empty-state">No historical measurements available for the selected filters.</td>
                </tr>
              )}
            </tbody>
          </table>
          {hoveredPollutant && (
            <div
              className="pollutant-hover-tooltip"
              style={{ left: hoveredPollutant.x + 16, top: hoveredPollutant.y + 16 }}
            >
              <div className="pollutant-hover-tooltip-title">{hoveredPollutant.pollutant}</div>
              <div className="pollutant-hover-tooltip-text">{getPollutantExplanation(hoveredPollutant.pollutant)}</div>
            </div>
          )}
        </div>
      </div>

      <button className="assistant-fab" onClick={() => setAssistantOpen(open => !open)} type="button">
        <span className="assistant-fab-icon">🤖</span>
        AI Assist
      </button>

      {assistantOpen && (
        <div className="assistant-panel" role="dialog" aria-label="BreatheSmart AI Assistant">
          <div className="assistant-panel-header">
            <div>
              <div className="assistant-panel-title">BreatheSmart AI Assistant</div>
              <div className="assistant-panel-subtitle">Ask questions about air quality and the app</div>
            </div>
            <button className="assistant-close-btn" onClick={() => setAssistantOpen(false)} type="button" aria-label="Close assistant">
              ×
            </button>
          </div>

          <div className="assistant-context">
            <div>OpenRouter assistant for general and app-related questions.</div>
          </div>

          <div className="assistant-messages">
            {assistantMessages.map((message, index) => (
              <div className={`assistant-message ${message.role}`} key={`${message.role}-${index}`}>
                <div className="assistant-message-bubble">
                  <div className="assistant-message-source">
                    {message.role === "user" ? "👤 You" : "🤖 BreatheSmart Assistant"}
                  </div>
                  <div className="assistant-message-content">
                    {message.role === "user" ? (
                      message.content
                    ) : (
                      <ReactMarkdown
                        components={{
                          p: ({children}) => <p style={{margin: '8px 0', lineHeight: '1.6'}}>{children}</p>,
                          strong: ({children}) => <strong style={{fontWeight: 600}}>{children}</strong>,
                          em: ({children}) => <em style={{fontStyle: 'italic'}}>{children}</em>,
                          ul: ({children}) => <ul style={{marginLeft: '16px', margin: '8px 0'}}>{children}</ul>,
                          ol: ({children}) => <ol style={{marginLeft: '16px', margin: '8px 0'}}>{children}</ol>,
                          li: ({children}) => <li style={{marginBottom: '4px', lineHeight: '1.5'}}>{children}</li>,
                          h1: ({children}) => <h3 style={{margin: '10px 0 5px 0', fontSize: '1.1em', fontWeight: 600}}>{children}</h3>,
                          h2: ({children}) => <h4 style={{margin: '10px 0 5px 0', fontSize: '1.05em', fontWeight: 600}}>{children}</h4>,
                          h3: ({children}) => <h5 style={{margin: '8px 0 4px 0', fontSize: '1em', fontWeight: 600}}>{children}</h5>,
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {assistantLoading && (
              <div className="assistant-message assistant">
                <div className="assistant-message-bubble assistant-loading">Thinking...</div>
              </div>
            )}
          </div>

          <div className="assistant-input-row">
            <input
              value={assistantInput}
              onChange={e => setAssistantInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAssistantSend();
                }
              }}
              placeholder="Ask a question about the app or air quality..."
              disabled={assistantLoading}
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
