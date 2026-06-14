# Station-First Implementation Report

## Executive Summary

The Air Quality Analytics backend has been successfully refactored to prioritize individual monitoring stations. Under the previous implementation, search results from different monitoring stations in a geographic area were averaged together in `groupSnapshot()`, which diluted the measurements and discarded valuable provider metadata. 

This refactor implements a station-first paradigm:
1. **Preserves All Provider Stations**: Measurements are grouped by station, allowing multiple stations in a single query boundary to remain distinct.
2. **Prevents Averaging Across Stations**: The `groupSnapshot()` function now isolates and snapshots only the primary station when multiple stations are returned.
3. **Preserves Metadata**: Full coordinate pairs, station names, and provider IDs are retained and returned for every station.
4. **Enriches WAQI Integration**: Refactored WAQI query flow to support station discovery via search keyword matching, followed by concurrent, detailed feed resolution for up to 5 matching stations.
5. **Ensures Backward Compatibility**: A new `stations[]` array is added to the API payload, while all legacy top-level fields are populated based on the highest-confidence `primaryStation`.

---

## Technical Implementation Details

### 1. Coordinate and Metadata Extraction
- **Helper Functions**: Added `getMeasurementCoordinates(item)` and `buildResolvedLocationMetadata(results, searchContext, fallbackQuery, source)` to `server/index.js`.
- **Granular Storage**: Replaced generic locality strings with complete provider metadata containing `stationId`, `stationName`, `coordinates`, and `confidence`.

### 2. Group Snapshot Refactoring
- **Original Behavior**: `groupSnapshot()` averaged all matching results regardless of the physical monitoring station they came from.
- **New Behavior**: `groupSnapshot()` detects if multiple stations are present in the dataset. If multiple stations exist, it isolates the measurements corresponding to the **primary station** (the one with the highest confidence score) and generates the snapshot for that station alone. This prevents cross-station averages from polluting the final result.

### 3. Multi-Station Discovery & WAQI Search Flow
- **Keyword Search**: Updated `fetchFromWAQI` to use `/search/?keyword=...` to retrieve a list of monitoring stations.
- **Parallel Resolution**: Resolves detailed pollutant feeds for the top 5 stations in parallel using `/feed/@uid/`.
- **Validation**: Each discovered station is validated against the search query using the `validateLocationMatch` utility, filtering out false positive matches.

### 4. Response Payload Structuring
The output of `/api/hybrid-measurements` has been structured to support both the station-first UI and legacy consumers:
```json
{
  "city": "Bengaluru",
  "resolvedLocation": "Hebbal, Bengaluru, India",
  "resolvedCoordinates": { "lat": 13.0359, "lon": 77.5978 },
  "providerLocation": "Hebbal, Bengaluru - CPCB",
  "stationMetadata": {
    "stationId": "11432",
    "stationName": "Hebbal, Bengaluru - CPCB",
    "coordinates": { "lat": 13.0359, "lon": 77.5978 },
    "confidence": 0.98
  },
  "snapshot": [ ... ],
  "stations": [
    {
      "stationId": "11432",
      "resolvedLocation": "Hebbal, Bengaluru - CPCB",
      "coordinates": { "lat": 13.0359, "lon": 77.5978 },
      "stationMetadata": { ... },
      "snapshot": [ ... ],
      "measurements": [ ... ]
    },
    {
      "stationId": "11435",
      "resolvedLocation": "Silk Board, Bengaluru - CPCB",
      "coordinates": { "lat": 12.9176, "lon": 77.6228 },
      "stationMetadata": { ... },
      "snapshot": [ ... ],
      "measurements": [ ... ]
    }
  ]
}
```

---

## Validation & Isolation Checks

- **Contract Integrity**: The hierarchy endpoint suite remains fully isolated and functional. All 29 contract validation tests passed successfully.
- **Search Scoping**: State and country queries (such as Karnataka or India) resolve to appropriate locations without pulling in unrelated city data. Mismatch protection prevents representative OpenAQ fallback stations (e.g. Delhi) from contaminating localized search responses.
