# Root Cause Report - Wrong Location Resolution Bug

## 1. Executive Summary

During testing of the station-first measurement preservation system, we identified a critical geographic correctness issue: queries for certain locations successfully loaded AQI data but displayed a completely unrelated resolved location (e.g., searching for "Chennai" returned data for "Sector-2 IMT, Manesar", which is near Delhi in Haryana; searching for "Houston, Texas" returned "Houston, Illinois" or "Houston, Canada"). 

We traced the complete search flow, identified two main validation loopholes, implemented a comprehensive fix using state-level and coordinate-level validation checks, and successfully verified that correct locations now resolve globally.

---

## 2. Search Flow Execution Trace

Below is the execution trace mapping how unrelated stations were surviving the search pipeline:

### Step 1: User Query & Search Context
- **User Input**: `{ city: "Chennai", country: "India", state: "Tamil Nadu" }`
- **Search Context**: Scopes the query to state `"Tamil Nadu"`, country `"India"`, and city candidate `"Chennai"`.

### Step 2: Provider Query Generation
- **Database Search**: Checks local database; fails or returns no records.
- **OpenAQ Search**: Checks for "Chennai"; returns no locations.
- **WAQI Search Fallback**: Cascades to WAQI and queries `/search/?keyword=Chennai`.

### Step 3: Provider Response
- WAQI's keyword search is highly fuzzy. It returns a list of stations containing partial text or coordinates, including:
  1. `Sector-2 IMT, Manesar, India` (station ID `12445`, coordinates `28.360699, 76.93609` - Haryana).
  2. `Hadapsar, Pune, Pune, India` (Maharashtra).

### Step 4: Location Validation Loophole
The server evaluated `validateLocationMatch("Chennai", "Sector-2 IMT, Manesar, India", { lat: 28.360699, lon: 76.93609 })`:
1. **City Mismatch Check**: It checks if `responseCity` and `queryCity` mismatch:
   - `queryCity` matches `Chennai` (state Tamil Nadu).
   - `responseCity` matches `null` because "Manesar" is not in the hardcoded list of 20 major Indian cities.
   - Since `responseCity` was `null`, the city mismatch check `responseCity.canonical !== queryCity.canonical` was **bypassed**.
2. **State Mismatch Check**: There was **no state-level verification check** in `validateLocationMatch`, allowing a station in Haryana to pass for a query in Tamil Nadu.
3. **Coordinate Warning Loophole**: The validator checked if the coordinates were within 2.2 degrees (~244km) of Chennai:
   - Chennai's coordinates are `{ lat: 13.0827, lon: 80.2707 }`.
   - Manesar's coordinates are `{ lat: 28.360699, lon: 76.93609 }` (1600km away).
   - The coordinates warning check failed. However, instead of rejecting the station, the validator only **downgraded the confidence score** to `0.72` and logged a warning: `known_city_alias_coordinate_distance_warning`.
4. **Validation Survival**: Since the validity threshold was set to `confidence >= 0.55`, the downgraded confidence of `0.72` was treated as **VALID**!

### Step 5: Primary Station Selection & Response
- Because the Manesar station survived validation with a score of `0.72` and no other valid stations were returned, the ranking system selected `Sector-2 IMT, Manesar` as the **primary station**.
- Top-level legacy fields were populated from this primary station, displaying Manesar data to the user.
- The health advice generator ran on the original query (`"Chennai"`), creating a mismatch where health advice was created for Chennai but displayed alongside Manesar AQI readings.

---

## 3. Resolution Details

To close these validation loopholes, we modified `server/utils/locationValidator.js` and `server/index.js` to implement:

1. **Strict Coordinate Boundary Enforcement**:
   - If a query city is a known Indian city, and coordinates are returned, they must be within 2.2 degrees.
   - If they are outside 2.2 degrees, the validator now immediately rejects the station (`isValid: false`, `confidence: 0`, `reason: 'coordinates_outside_city_bounds'`).
2. **State Mismatch Rejection**:
   - Expanded `validateLocationMatch` to accept `state` as the 6th argument.
   - Defined a `STATE_ALIASES` map covering major states and abbreviations (e.g. `karnataka: ['karnataka', 'ka']`, `texas: ['texas', 'tx']`).
   - If the response matches another known state's alias but does not match the requested target state's alias, it is immediately rejected (`isValid: false`, `confidence: 0`, `reason: 'state_mismatch'`).
3. **API Integration**:
   - Updated `fetchFromWAQI` and `fetchFromOpenWeather` to accept target country/state parameters and forward them to the validator.
