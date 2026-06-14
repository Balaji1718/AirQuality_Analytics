# Universal Search Migration Plan

This migration plan outlines the step-by-step roadmap for moving from multi-step dropdown selection to the unified **Universal Search Experience** once search accuracy fixes are approved.

---

## 1. Migration Overview

The goal is to replace the multi-step select flow with a single search input bar. To minimize disruption and ensure backward compatibility:
- The backend `/api/search` endpoint will be implemented as a new route.
- The frontend will replace the main dropdowns with a unified search bar.
- The legacy hierarchy dropdown selects will be preserved and relocated to an optional, collapsible "Advanced Filters" panel.
- All rollback protections and fallback API channels remain intact.

---

## 2. Implementation Phases

### Phase 1: Backend API Implementation (`/api/search`)
1. Create a search controller in `server/index.js` mapping to `GET /api/search`.
2. Integrate database lookup across `countries`, `states`, and `cities`.
3. Integrate OpenAQ location geocoding searches and WAQI station keyword queries.
4. Implement the scoring and deduplication helper to rank suggestions.
5. Add unit tests for query classifications.

### Phase 2: Frontend Search Component Refactoring
1. Replace `CountrySelect`, `StateSelect`, and `CitySelect` blocks in `client/src/App.js` with a unified `UniversalSearchBar` component.
2. Implement search debounce (e.g. wait 300ms after keystroke before querying backend) to prevent API rate limit fatigue.
3. Style the autocomplete dropdown to render icons indicating classification type:
   - 📍 Location (Countries, States, Cities)
   - 📡 Sensor (Monitoring Stations)
4. Bind suggestion click handlers to dispatch search payloads:
   - Clicking a country suggestion fetches country-level metrics.
   - Clicking a city suggestion fetches city-level measurements.
   - Clicking a station suggestion queries the specific station metadata directly.

### Phase 3: Advanced Filters Collapsible Section
1. Relocate the legacy dropdown hierarchy UI into an expandable panel labelled `Advanced Search Filters`.
2. Sync selections between the universal search bar and advanced filters (e.g. if the user searches "Chennai, Tamil Nadu, India", the dropdown filters automatically set themselves to India ➔ Tamil Nadu ➔ Chennai).

### Phase 4: Integration & Regression Verification
1. Run full validation checks to verify that:
   - Exact station searches resolve to correct stations.
   - City and locality searches resolve strictly to their boundaries.
   - Zero regression is introduced to `/api/hybrid-measurements` or `/api/hierarchy/*`.

---

## 3. Safety & Rollback Controls

- **Feature Flag Protection**:
  Implement a frontend toggle `REACT_APP_USE_UNIVERSAL_SEARCH=true`. If set to `false`, the UI automatically falls back to displaying the legacy dropdown dashboard structure.
- **API Response Preservation**:
  No existing routes (`/api/hybrid-measurements`, `/api/locations`) will be modified, ensuring external API consumers suffer no breaking changes.
