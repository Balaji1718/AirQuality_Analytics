# Location Resolution Quality Report

Generated on: 2026-06-13T07:06:17.950Z

## 1. Executive Summary

This report evaluates the BreatheSmart Search Pipeline against 6 Location Resolution Quality Rules. We analyzed query resolutions for the test queries to determine if any raw inputs bypass resolution, if administrative boundaries are fully preserved, and if cross-country or cross-city leakage exists.

## 2. Evaluation Against Quality Rules

### Rule 1: No raw user input displayed as resolved location (unless resolution fails)
* **Status**: 🟢 **PASS**
* **Analysis**: Input queries are mapped to canonical city registries or geocoded locations. Misspellings like `Delh` correctly resolve to `Delhi, India`. The frontend displays provider-resolved locations rather than raw search strings.

### Rule 2: Resolved location includes locality, city, state, and country (when available)
* **Status**: 🟡 **PARTIAL PASS**
* **Analysis**: Resolved locations for city and locality queries successfully include administrative boundaries (e.g. `Tirunelveli, Tamil Nadu, India (OpenWeather)` and `Hebbal, Bengaluru, India`). However, some OpenAQ cities like `Houston North Loop C` display the station name directly without the parent state (`Texas`) or country (`USA`) in the top-level string. Autocomplete formatting should be standardized.

### Rule 3: Provider metadata is preserved
* **Status**: 🟢 **PASS**
* **Analysis**: Provider sources are captured (`OpenAQ`, `WAQI`, `OpenWeather`) and populated in `responseData.source` and `responseData.apiInfo.primarySource`.

### Rule 4: Station metadata is preserved
* **Status**: 🟢 **PASS**
* **Analysis**: Station metadata (stationId, coordinates, and confidence scores) are correctly returned in the `stations[]` array and top-level `stationMetadata` object in the API response.

### Rule 5: No city query resolves to a foreign country
* **Status**: 🟢 **PASS**
* **Analysis**: Salem resolves correctly to Salem, India (coords `[11.6643, 78.146]`) instead of Salem, USA. Houston correctly resolves to Houston, USA. Boundary validation checks prevent cross-country coordinate mapping.

### Rule 6: No locality query resolves to an unrelated city
* **Status**: 🟢 **PASS**
* **Analysis**: Hebbal maps to parent city Bengaluru, India. Sion maps to parent city Mumbai, India. Localities are successfully scoped to their parent cities.

## 3. Discovered Anomalies (Urgent Attention Required)

> [!WARNING]
> **Foreign Region Country Hardcoding**
> State/Region searches for non-Indian regions like `Texas`, `California`, and `Ontario` resolve with the country code `India` (e.g. `Texas, India` and `Ontario, India`). This is because `buildHierarchicalSearchContext()` hardcodes the country search object to `India` for all region-level queries. This requires a lookup mapping in Phase 4.

