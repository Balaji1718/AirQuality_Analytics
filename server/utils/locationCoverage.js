const NORTH_AMERICA = new Set(['United States', 'Canada', 'Mexico', 'Puerto Rico']);
const SOUTH_AMERICA = new Set(['Chile', 'Argentina', 'Peru']);
const EUROPE = new Set(['United Kingdom', 'Netherlands', 'Poland', 'Bosnia and Herzegovina']);
const ASIA = new Set(['India', 'China', 'Thailand', 'Mongolia', 'Bangladesh', 'Singapore', 'Vietnam', 'Israel']);
const AFRICA = new Set(['Ghana', 'Nigeria']);
const OCEANIA = new Set(['Australia']);

function inferRegion(country) {
  if (!country) return 'Unknown';
  if (NORTH_AMERICA.has(country)) return 'North America';
  if (SOUTH_AMERICA.has(country)) return 'South America';
  if (EUROPE.has(country)) return 'Europe';
  if (ASIA.has(country)) return 'Asia';
  if (AFRICA.has(country)) return 'Africa';
  if (OCEANIA.has(country)) return 'Oceania';
  return 'Other';
}

function summarizeCoverage(locations) {
  const countryCounts = new Map();
  const regionCounts = new Map();

  for (const loc of locations || []) {
    const country = loc.country?.name || loc.country || 'Unknown';
    const region = inferRegion(country);
    countryCounts.set(country, (countryCounts.get(country) || 0) + 1);
    regionCounts.set(region, (regionCounts.get(region) || 0) + 1);
  }

  return {
    totalLocations: locations?.length || 0,
    totalCountries: countryCounts.size,
    countries: [...countryCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([country, count]) => ({ country, locations: count, region: inferRegion(country) })),
    regions: [...regionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([region, count]) => ({ region, locations: count })),
  };
}

function buildSourceComparison({ locations, query = '', matchedLocations = [] }) {
  const coverage = summarizeCoverage(locations);
  const matchedCountries = [...new Set((matchedLocations || []).map(loc => loc.country?.name || loc.country).filter(Boolean))];
  const normalizedQuery = query.trim().toLowerCase();

  const sourceComparison = [
    {
      name: 'OpenAQ',
      role: 'Station discovery and current measurements',
      coverage: {
        countries: coverage.totalCountries,
        stations: coverage.totalLocations,
        regions: coverage.regions.length,
      },
      fit: ['country', 'city', 'station name'],
      strength: 'Best for station-level discovery where OpenAQ already has coverage',
      limitation: 'Requires live API access and may be sparse in some areas',
    },
    {
      name: 'WAQI',
      role: 'City-level AQI lookup',
      coverage: '11,000+ stations worldwide, 1000+ cities',
      fit: ['city', 'region', 'geo coordinates'],
      strength: 'Broad global coverage and a practical fallback when station coverage is sparse',
      limitation: 'AQI-centric, less granular than station measurements',
    },
    {
      name: 'OpenWeather',
      role: 'Coordinate-based pollution lookup',
      coverage: 'Global coordinates',
      fit: ['latitude/longitude', 'geocoded place'],
      strength: 'Works anywhere on Earth once coordinates are known',
      limitation: 'Needs coordinates, so it depends on a geocoding step',
    },
  ];

  const referenceLocationProviders = [
    {
      name: 'Google Maps Geocoding',
      role: 'Global geocoding and place search',
      status: 'Not wired in this app',
      useCase: 'Resolve arbitrary place names to coordinates before AQ lookup',
    },
    {
      name: 'OpenStreetMap Nominatim',
      role: 'Open geocoding and place search',
      status: 'Not wired in this app',
      useCase: 'Useful fallback when place-to-coordinate resolution is needed',
    },
    {
      name: 'GeoNames',
      role: 'World place names and administrative areas',
      status: 'Not wired in this app',
      useCase: 'Useful for region/country normalization and place hierarchy lookup',
    },
  ];

  let recommendation = 'Use OpenAQ first for exact station/city matches, then WAQI for wider city coverage, then OpenWeather once coordinates are known.';

  if (matchedCountries.length > 0) {
    recommendation = `OpenAQ already covers ${matchedCountries.length} matched country/city area(s) for "${query}"; use it first and fall back to WAQI/OpenWeather only if the live measurement query fails.`;
  } else if (normalizedQuery && ['america', 'usa', 'us', 'united states'].includes(normalizedQuery)) {
    recommendation = 'Treat this as a country query and use the OpenAQ country station list first, then WAQI, then OpenWeather by coordinates from any matched station.';
  }

  return {
    query,
    queryType: matchedCountries.length > 0 ? 'known-location' : 'unresolved-or-broad',
    openaq: coverage,
    sourceComparison,
    referenceLocationProviders,
    recommendation,
    bestRouting: [
      '1. Exact country/city/station match -> OpenAQ',
      '2. Broad city/metro lookup -> WAQI',
      '3. Coordinates available -> OpenWeather',
      '4. Unknown place name -> geocode first, then route by coordinates'
    ]
  };
}

module.exports = {
  inferRegion,
  summarizeCoverage,
  buildSourceComparison,
};