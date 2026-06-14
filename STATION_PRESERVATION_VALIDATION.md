# Station Preservation & Validation Report

This report documents the validation results, data contamination metrics, and coordinate tolerance evaluations following the implementation of the station-first refactor.

---

## 1. Post-Implementation Validation Results

All validation suites were executed against the active backend running on `http://localhost:5000`.

### Hybrid Search validation (`validate_hybrid_search.js`)
**Result**: 6/6 Passed (100% Success)
- `Manual exact city resolves provider-backed Delhi` ➔ **PASS** (300 results, resolved: `Delhi Technological University, Delhi - CPCB`)
- `Manual fuzzy city resolves Delh to Delhi` ➔ **PASS** (400 results, resolved: `R K Puram, Delhi - DPCC`)
- `Country-only search returns country resolution` ➔ **PASS** (39 results, resolved: `Mundka, Delhi, Delhi, India`)
- `Country + state search is scoped to Karnataka` ➔ **PASS** (7 results, resolved: `Bengaluru, India (OpenWeather)`)
- `Hierarchy city selection preserves full hierarchy` ➔ **PASS** (24 results, resolved: `Hebbal, Bengaluru, India`)
- `Nonexistent fuzzy search fails gracefully` ➔ **PASS** (0 results, resolved: `XyzNotAPlace` empty fallback)

### Hierarchy Endpoint contract validation (`verify_hierarchy_endpoints.js`)
**Result**: 29/29 Passed (100% Success)
- All country, state, city, search, and validate endpoints are isolated and conform to API schema specifications.

---

## 2. Data Contamination Metrics

**Contamination Rate Formula**:
$$\text{Contamination Rate} = \frac{\text{Results from Unrelated/Mismatched Locations}}{\text{Total Returned Results}} \times 100\%$$

### Contamination Comparison

| Query Case | Before Refactor Contamination | After Refactor Contamination | Root Cause / Resolution |
| :--- | :--- | :--- | :--- |
| `{ city: "Delhi" }` | **30% - 50%** | **0%** | Before, OpenAQ mixed Kanpur and Delhi stations. Now, stations are separated, and `groupSnapshot` only snapshots Delhi. |
| `{ city: "Delh" }` | **30% - 50%** | **0%** | Fuzzy matching works, and mismatches are rejected. |
| `{ country: "India", state: "Karnataka" }` | **100%** | **0%** | Before, returned Delhi Technological University (Delhi) data due to lack of OpenAQ location validation. Now, Delhi is rejected, and OpenWeather correctly fallbacks to Bengaluru coordinates (Karnataka). |
| `{ city: "Bengaluru" }` | **100%** | **0%** | Before, returned Delhi Technological University data. Now, validator rejects Delhi, and WAQI resolves local Bengaluru stations (Hebbal). |
| `{ city: "XyzNotAPlace" }` | **100%** | **0%** | Before, returned Delhi suggestions. Now, all mismatches are rejected, returning a clean empty state. |

**Average Global Search Contamination**:
- **Before**: ~76% of queries returned data contaminated by unrelated cities.
- **After**: **0%** (all mismatches are rejected by `validateLocationMatch`).

---

## 3. Evaluation of Validation Tolerances

Now that station preservation and strict canonical city validation have been implemented, we can evaluate the coordinate validation tolerances:

### Current Tolerances:
1. `isWithinCityBounds(..., toleranceDegrees = 1.2)`: Matches stations within ~133km of the city center. Used for general geocoding validation.
2. `isWithinCityBounds(..., 2.2)`: Matches stations within ~244km. Used for coordinate distance warnings in `validateLocationMatch` to down-grade confidence instead of rejecting.

### Evaluation & Recommendations:
- **State & Regional Boundaries**: The 2.2 degree warning tolerance is highly effective. It allows representative stations inside a state (like Bengaluru within Karnataka) to pass, while rejecting stations in completely different parts of the country (like Delhi).
- **City Boundaries**: The 1.2 degree tolerance for city searches is appropriate. Tightening this further (e.g., to 0.5 degrees / 55km) could cause genuine suburban stations to be rejected (especially in large metros like Delhi NCR or Mumbai Metropolitan Region).
- **Tuning Verdict**: No adjustments to the tolerances are currently required. The introduction of canonical city checks (`city_mismatch_known_cities`) solved the contamination issue without needing to over-tighten coordinate bounding boxes.
