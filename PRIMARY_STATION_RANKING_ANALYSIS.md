# Primary Station Ranking & Selection Analysis

This document analyzes the primary station selection algorithm, the ranking anomalies that allowed geographically incorrect stations to win primary selection, and the hardened selection logic.

---

## 1. Candidate Ranking Mechanics

The multi-source search pipeline resolves measurements from multiple monitoring stations. The server groups these measurements by station and maps them into candidate station structures. 

To select the representative **primary station** for backward-compatible top-level fields:
1. Every candidate station inherits a `confidence` rating from its highest-confidence measurement item (validated by `validateLocationMatch`).
2. Candidate stations are sorted in descending order of confidence:
   ```javascript
   stations.sort((a, b) => (b.stationMetadata?.confidence || 0) - (a.stationMetadata?.confidence || 0));
   ```
3. The station at index `0` is selected as the `primaryStation`:
   ```javascript
   const primaryStation = stations[0] || { snapshot: [], resolvedLocation: cityName, ... };
   ```

---

## 2. Why Unrelated Stations Previously Won Selection

Two main factors allowed unrelated stations to be ranked as the primary station:

### Anomaly A: Lax Validation Thresholds
Because the coordinates mismatch warning only downgraded the confidence score to `0.72` (and did not reject it), the station remained in the valid candidate list. A confidence score of `0.72` is extremely high, placing it above standard fallbacks (like OpenWeather coordinate estimations which default to `0.55`).

### Anomaly B: Empty Query Cascades
When a user searched for "Chennai" in WAQI, the search endpoint `/search/?keyword=Chennai` returned:
- `Sector-2 IMT, Manesar, India` (confidence `0.72` due to coordinate warning loophole)
- `Hadapsar, Pune, Pune, India` (confidence `0.72` due to coordinate warning loophole)

Since actual Chennai stations were either not returned by the keyword search or filtered out, the only candidates that survived validation were the unrelated ones. Because their confidence score (`0.72`) was above `0`, they were sorted to the top, and Manesar was selected as the primary station.

---

## 3. Hardened Candidate Selection Logic

Following the validator updates, the selection algorithm has been secured against geographical pollution:

### 1. Strict Boundary Discarding
Any station that does not match the canonical city boundary (> 2.2 degrees away) or state boundary is assigned `isValid: false` and `confidence: 0`. This ensures it is discarded from the candidates pool during provider mapping and never enters the `stations[]` array.

### 2. High-Accuracy Fallback Cascade
If all returned provider stations are discarded (e.g. WAQI search only returned Manesar/Pune for Chennai, which were all rejected), the results array becomes empty. The handler then cascades to the next provider (OpenWeather), which geocodes strictly using Chennai's coordinates, producing a high-accuracy result:
- **Resolved Location**: `Arumbakkam, Chennai, Chennai, India`
- **Coordinates**: `13.0664, 80.2112`
- **Confidence**: `0.98`

This guarantees that a geographically incorrect match can never override a geographically superior coordinates-based fallback.
