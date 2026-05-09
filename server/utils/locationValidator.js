// Minimal stub to prevent import errors
// This file was created to maintain compatibility after removing location validation

module.exports = {
  validateLocationMatch: (query, response, lat, lon, country) => {
    const raw = (response || query || '').toString();
    let inferredCountry = country || 'Unknown';

    // Light, non-strict inference from response text to avoid wrong hardcoded country
    if (!country && raw) {
      const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
      if (parts.length > 1) inferredCountry = parts[parts.length - 1];
    }

    return {
      isValid: true,
      confidence: 1,
      reason: '',
      normalized: {
        city: raw || query,
        country: inferredCountry,
        coordinates: { lat, lon }
      }
    };
  },
  
  findIndianCity: (city) => null,
  
  getAllIndianCities: () => [],
  
  isWithinIndiaBounds: (lat, lon) => true,
  
  getStandardCoordinates: (city) => null,
  
  isWithinCityBounds: (lat, lon, cityData) => true
};