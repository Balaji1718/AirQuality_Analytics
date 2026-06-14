# Phase 1: End-to-End Search Trace Report

## Executive Summary
This report identifies the exact execution points where location quality and provider enrichment are degraded within the `/api/hybrid-measurements` endpoint. The core issue is that user input and provider metadata are forcefully replaced by normalized, generic hierarchy labels, and the strict validation blocks detailed stations from being successfully matched.

## End-to-End Trace Example

**Scenario:** User searches for a specific Indian neighborhood, e.g., `"Delh"` (fuzzy).

### 1. Frontend Request Payload (`client/src/App.js` L692)
* **Actual Output:** `{ city: "Delh" }`

### 2. Backend Search Context (`server/index.js` L322 `buildHierarchicalSearchContext`)
* **Expected:** Should resolve "Delh" to "Delhi" via fuzzy match and prepare a precise context.
* **Actual Output:** 
  ```javascript
  {
    query: "Delh",
    level: "local",
    country: null,
    state: "",
    regionCandidates: [],
    apiQueries: ["Delh"],
    displayLabel: "Delh"
  }
  ```
* **If exact match like `city: "Delhi"` is passed:**
  ```javascript
  {
    query: "Delhi",
    level: "local",
    // ...
    apiQueries: ["Delhi"],
    displayLabel: "Delhi"
  }
  ```

### 3. Provider Requests (OpenAQ/WAQI)
* **Execution Path:** `server/index.js` `fetchFromWAQI(candidate)`
* **Input:** `candidate` is `"Delhi"` (or the raw input / fallback region).
* **Location Validator Bypass:** `utils/locationValidator.js` intercepts this via `getStandardCoordinates("Delhi")`. It replaces the query with coordinates `{ lat: 28.6139, lon: 77.2090 }`.
* **Provider Request:** `WAQI /feed/geo:28.6139;77.2090/`

### 4. Provider Response (WAQI)
* **Provider Payload (Sample):**
  ```json
  {
    "status": "ok",
    "data": {
      "aqi": 150,
      "city": { "name": "Anand Vihar, Delhi, India" }
    }
  }
  ```

### 5. Normalization & Validation (`server/utils/locationValidator.js` L160 `validateLocationMatch`)
* **Execution Path:** The `validateLocationMatch` function receives `query = "Delhi"`, `response = "Anand Vihar, Delhi, India"`.
* **Break Point 1:** The validator strips out agency names and strictly compares the text. 
* **Break Point 2:** It heavily penalizes text that doesn't exactly match the generic query.
* **Data Loss:** If the validator succeeds, it returns `normalized: { city: canonicalCity, country: canonicalCountry }`. This forces the location back to the generic `canonicalCity` (e.g., `"Delhi"` or whatever the hierarchy query was), discarding `"Anand Vihar"`.

### 6. Final API Response Assembly (`server/index.js` L1226)
* **Break Point 3:** The results object maps the `location` field explicitly to `${locationValidation.normalized.city}, ${locationValidation.normalized.country}`. 
* **Lost Metadata:** The `providerLocation` is set to `data.city.name`, but the primary `location` field (which the UI uses as the main label) has permanently lost the "Anand Vihar" specificity. If the query came from a generic hierarchy like "General Region", the validation will force the output location to be "General Region".

### 7. Frontend Processing (`client/src/App.js` L1497)
* The frontend consumes the `location` string. Because it was overwritten by the backend's `normalized.city`, the UI simply displays `"Delhi, India"` or `"General Region, India"` instead of the actual station name. Raw user input (if it bypasses validation) is simply reflected back.

## Conclusion
The provider-enriched location metadata is lost explicitly at `server/index.js` during the mapping of the provider response, where it forcibly uses `locationValidation.normalized.city` instead of the richer `data.city?.name` for the main `location` attribute. The generic hierarchy queries force fuzzy matching to fail, returning generic fallbacks.