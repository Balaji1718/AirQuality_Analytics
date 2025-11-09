// Minimal stub to prevent import errors
// This file was created to maintain compatibility after removing location validation

module.exports = {
  validateLocationMatch: (query, response, lat, lon, country) => ({
    isValid: true,
    confidence: 1,
    reason: '',
    normalized: {
      city: response || query,
      country: country || 'India',
      coordinates: { lat, lon }
    }
  }),
  
  findIndianCity: (city) => null,
  
  getAllIndianCities: () => [],
  
  isWithinIndiaBounds: (lat, lon) => true,
  
  getStandardCoordinates: (city) => null,
  
  isWithinCityBounds: (lat, lon, cityData) => true
};