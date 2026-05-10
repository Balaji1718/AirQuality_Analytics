# Frontend Architecture - Hierarchical AQI Search Dropdown

**Phase:** Design & Planning (Pre-Implementation)  
**Purpose:** Define search/dropdown architecture without code changes yet

---

## Current State

**Problem Areas:**
- Static country list (193 countries) shown in dropdown
- No indication of which countries have AQI data
- No hierarchical support (can't drill down to states/cities)
- Search doesn't differentiate supported vs unsupported
- Frontend makes backend query for every keystroke

**User Experience:**
```
Input: "New Delhi"
↓
Backend query: /api/hybrid-measurements?city=New Delhi
↓
Wait 500-2000ms...
↓
Result shown or empty state
```

---

## Proposed Architecture

### Three-Component Search System

```
┌─────────────────────────────────────────────┐
│  Global Search Input                        │
│  [Type country, state, or city...]          │
└──────────────┬──────────────────────────────┘
               │
         ┌─────▼─────┐
         │ Tier 1?   │
         └──┬──────┬─┘
      Yes ▲ │      │ No
         ┌─┴────┐  │
    ┌────►  Match  ◄─┘
    │    Local     
    │    Cache
    │    (instant)
    │
    │         ┌─────────────────┐
    │         │ Tier 2: Backend │
    │         │ (500ms timeout) │
    │         └─────────────────┘
    │                │
    └────────────────┴──────────────────┐
                                         │
                    ┌────────────────────▼──────────────────┐
                    │ Render Results with Coverage Hints    │
                    │ - Country (✅ Full | ⚠️ Partial)     │
                    │ - State (if multi-level)              │
                    │ - City (with coordinates)             │
                    └─────────────────────────────────────────┘
```

### Data Flow: From User Input to Result

```javascript
// User types "delhi"

1. LOCAL SEARCH (Tier 1 - Instant)
   ├─ Search cached countries: "Delhi" → no match
   ├─ Search cached cities: "Delhi" → 
   │  └─ Results: [
   │      { type: "city", name: "New Delhi", country: "India", 
   │        coverage: "full", sources: ["openaq", "openweather"] }
   │    ]
   └─ Show results with badges

2. BACKEND SEARCH (Tier 2 - On demand)
   ├─ If no local matches or user requests more
   ├─ POST /api/hierarchy/search?q=delhi
   ├─ Wait 500ms timeout
   └─ Merge results (dedup)

3. FALLBACK (Tier 3 - Last resort)
   ├─ If still no match
   ├─ Show "Try: India, China, New York..."
   ├─ Suggest coverage report link
   └─ Option to notify when city added
```

---

## Component Design

### 1. AQI Search Dropdown Component

```javascript
<AQISearchDropdown 
  onSelect={(location) => performSearch(location)}
  onLoadingStart={() => setLoading(true)}
  onLoadingEnd={() => setLoading(false)}
/>
```

**Features:**
- Real-time search as user types
- Debounced backend query (300ms)
- Result grouping by type (Country, State, City)
- Coverage badges for each result
- Keyboard navigation (arrow keys, enter)
- Recent searches
- Popular destinations quick-links

### 2. Dropdown Content Structure

```
┌─────────────────────────────────────┐
│  🔍 Search for city or country...   │
│  [Type here...........................] │
├─────────────────────────────────────┤
│                                     │
│ SUGGESTED (if no input)             │
│ ─────────────────────────────────   │
│ 🔥 Popular:                         │
│   → New Delhi (✅ Full)             │
│   → Beijing (✅ Full)               │
│   → Tokyo (⚠️ Limited)              │
│                                     │
│ 🕐 Recent:                          │
│   → Mumbai, India                   │
│   → London, UK                      │
│                                     │
├─────────────────────────────────────┤
│ SEARCH RESULTS                      │
│ ─────────────────────────────────   │
│ COUNTRIES (30 with data)            │
│   → India                ✅ Full     │
│   → China                ✅ Full     │
│   → Japan                ⚠️ Limited  │
│                                     │
│ STATES (if multi-level)             │
│   → Delhi, India         ✅ Full     │
│                                     │
│ CITIES                              │
│   → New Delhi, Delhi     ✅ Full     │
│   → Delhi University     ✅ Full     │
│                                     │
├─────────────────────────────────────┤
│ View coverage report →              │
│ Can't find your city? Notify me →   │
└─────────────────────────────────────┘
```

### 3. Coverage Badge System

```javascript
// Badge types
<Badge type="full">
  ✅ Full | OpenAQ, OpenWeather
</Badge>

<Badge type="partial">
  ⚠️ Limited | OpenWeather only
</Badge>

<Badge type="none">
  ❌ No Data | Add to watchlist?
</Badge>
```

**Placement:**
- Next to country names: `India (✅ Full)`
- Next to city names: `New Delhi (✅)`
- In search results: Next to each result
- In dropdown header: Count of supported countries

---

## Three-Tier Loading Strategy

### Tier 1: Local Data (Session Initialization)

**When:** App loads once  
**Source:** Downloaded during app init  
**Cached:** Entire session  
**Size:** ~1KB (country list) + ~50KB (top cities)

```javascript
// On app load:
async function initializeSearchCache() {
  // 1. Fetch country list (30 countries)
  const countries = await fetch('/api/hierarchy/countries');
  sessionStorage.setItem('aqi_countries', JSON.stringify(countries));
  
  // 2. Fetch top 100 cities globally
  const topCities = await fetch('/api/hierarchy/top-cities?limit=100');
  sessionStorage.setItem('aqi_top_cities', JSON.stringify(topCities));
  
  // 3. Ready for instant search
  setSearchReady(true);
}

// Now user can type and get instant results
```

### Tier 2: Dynamic Backend Search (On Demand)

**When:** User types and no local match  
**Source:** Backend API  
**Debounce:** 300ms  
**Timeout:** 500ms  
**Caching:** Result stored for 5 min

```javascript
const [searchCache, setSearchCache] = useState({});
const searchTimeout = useRef(null);

const handleSearch = (query) => {
  // Check local cache first
  if (searchCache[query]) {
    return setResults(searchCache[query]);
  }
  
  // Debounce backend query
  clearTimeout(searchTimeout.current);
  searchTimeout.current = setTimeout(async () => {
    try {
      const response = await fetch(
        `/api/hierarchy/search?q=${query}`,
        { signal: AbortSignal.timeout(500) }
      );
      const results = await response.json();
      
      // Cache for 5 minutes
      setSearchCache({
        ...searchCache,
        [query]: results
      });
      
      setResults(results);
    } catch (err) {
      // Timeout or error - use local data only
      console.warn('Search timeout, showing local results only');
    }
  }, 300);
};
```

### Tier 3: Hierarchical Navigation (Optional)

**When:** User selects country  
**Source:** Pre-computed hierarchy  
**Loading:** Progressive reveal

```javascript
const handleCountrySelect = async (country) => {
  // Already have hierarchy from Tier 1
  const hierarchy = aqi_countries[country.iso2];
  
  // Show states/provinces
  setStates(hierarchy.states);
  
  // On state select, show cities (paginated)
  const handleStateSelect = async (state) => {
    const cities = await fetch(
      `/api/hierarchy/countries/${country.iso2}/states/${state.id}/cities`,
      { params: { page: 1, limit: 50 } }
    );
    setCities(cities);
  };
};
```

---

## Search Ranking Algorithm

### Smart Result Ordering

```javascript
const rankResults = (results, query) => {
  return results.sort((a, b) => {
    // Score calculation
    const scoreA = calculateScore(a, query);
    const scoreB = calculateScore(b, query);
    return scoreB - scoreA;
  });
};

function calculateScore(result, query) {
  let score = 0;
  
  // 1. Exact match (highest)
  if (result.name.toLowerCase() === query.toLowerCase()) {
    score += 1000;
  }
  
  // 2. Starts with query
  else if (result.name.toLowerCase().startsWith(query.toLowerCase())) {
    score += 500;
  }
  
  // 3. Contains query
  else if (result.name.toLowerCase().includes(query.toLowerCase())) {
    score += 250;
  }
  
  // 4. Coverage level bonus
  if (result.coverage === 'full') score += 100;
  if (result.coverage === 'partial') score += 50;
  
  // 5. Type bonus (city > state > country)
  if (result.type === 'city') score += 50;
  if (result.type === 'state') score += 25;
  if (result.type === 'country') score += 10;
  
  // 6. Popularity bonus (most searched)
  if (result.popularity_rank) {
    score += Math.max(0, 100 - result.popularity_rank);
  }
  
  // 7. Recency bonus (searched recently)
  if (result.last_searched) {
    const hoursSinceSearch = 
      (Date.now() - result.last_searched) / (1000 * 60 * 60);
    if (hoursSinceSearch < 24) {
      score += 50 * Math.exp(-hoursSinceSearch / 12);
    }
  }
  
  return score;
}
```

---

## Empty State Handling

### When No Results Found

```javascript
<EmptyState 
  query={query}
  suggestedCountries={['India', 'China', 'USA']}
  onSuggestedSelect={handleSelect}
  onViewCoverage={() => navigateTo('/coverage')}
  onNotifyMe={() => openNotificationModal()}
/>
```

**Display:**
```
❌ No results for "Tokyo Disneyland"

Suggestions:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌍 Try these supported locations:
   → Tokyo, Japan       (⚠️ Limited: OpenWeather)
   → New Delhi, India   (✅ Full: OpenAQ)
   → Beijing, China     (✅ Full: OpenAQ)

👀 View AQI coverage report
🔔 Notify me when Tokyo adds more data
```

---

## Performance Optimization

### Caching Strategy

| What | Where | TTL | Size |
|------|-------|-----|------|
| Country list | SessionStorage | Session | 1 KB |
| Top 100 cities | SessionStorage | Session | 50 KB |
| Search queries | Memory | 5 min | Variable |
| Hierarchy (per country) | Memory | Session | 10-100 KB/country |

### Network Optimization

```javascript
// Request batching
const batchRequests = (queries) => {
  // Combine multiple search queries
  return fetch('/api/hierarchy/search/batch', {
    method: 'POST',
    body: JSON.stringify({ queries })
  });
};

// Request prioritization
const priorityQueue = {
  high: 'country selection',      // User just selected
  medium: 'search results',        // User searching
  low: 'cache refresh'             // Background update
};

// Smart prefetching
const prefetchNearby = (city) => {
  // Fetch nearby cities while user reading current result
  const nearby = calculateNearbyCoordinates(city.lat, city.lon, 50); // 50km
  fetch('/api/cities/nearby', { params: nearby });
};
```

### Rendering Optimization

```javascript
// Virtual list for large result sets
<VirtualList 
  items={results}
  itemHeight={50}
  visibleItems={15}
  renderItem={renderResultItem}
/>

// Debounced input
<DebounceInput
  minLength={2}
  debounceTimeout={300}
  onChange={handleSearch}
/>

// Lazy load state/city levels
{countrySelected && (
  <Suspense fallback={<Spinner />}>
    <StateSelector country={selected} />
  </Suspense>
)}
```

---

## Keyboard Navigation

### Keybindings

| Key | Action |
|-----|--------|
| ↑/↓ | Navigate results |
| ↵ | Select result / Go to next level |
| ← | Back to previous level |
| Esc | Close dropdown |
| / | Focus search (global shortcut) |
| ? | Show help |

```javascript
const handleKeyDown = (e) => {
  switch(e.key) {
    case 'ArrowDown':
      setSelectedIndex(prev => (prev + 1) % results.length);
      break;
    case 'ArrowUp':
      setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
      break;
    case 'Enter':
      handleSelect(results[selectedIndex]);
      break;
    case 'Escape':
      closeDropdown();
      break;
  }
};
```

---

## Mobile Responsiveness

### Mobile View

```
┌────────────────────────────┐
│ 🔍 Search for city...      │ (Full width)
├────────────────────────────┤
│                            │
│ POPULAR NEARBY             │
│ Based on location: ⚪      │
│ ────────────────────────   │
│ 📍 Delhi (←32 km)          │
│ 📍 Ghaziabad (→19 km)      │
│                            │
│ ────────────────────────── │
│ COUNTRIES (scroll)         │
│ 📍 India                   │
│ 📍 China                   │
│ 📍 USA                     │
│                            │
└────────────────────────────┘
```

**Features:**
- Full-screen dropdown on mobile
- Touch-friendly result size (44px min height)
- Geolocation-based "nearby" suggestions
- Single-column layout
- Swipe gestures for navigation

---

## Analytics & Monitoring

### Metrics to Track

```javascript
// Search analytics
logEvent('search_initiated', { query_length: query.length });
logEvent('search_completed', { 
  query, 
  results_count: results.length,
  time_to_results: elapsedTime,
  tier_used: 'local' | 'backend'
});
logEvent('search_result_selected', { 
  result_type: 'country' | 'state' | 'city',
  result_name: result.name,
  coverage: result.coverage
});

// Performance metrics
logMetric('search_response_time', elapsedTime);
logMetric('cache_hit_rate', cacheHits / totalSearches);
logMetric('empty_result_rate', emptyResults / totalSearches);

// UX metrics
logEvent('unsupported_location_searched', {
  query,
  suggestion_shown: true,
  user_action: 'viewed_coverage' | 'set_notification'
});
```

---

## Integration Points

### With Existing Code

**App.js Changes:**
```javascript
// Replace static country list dropdown
- <CountryDropdown countries={staticCountries} />
+ <AQISearchDropdown 
+   onSelect={handleLocationSelect}
+   onLoadingState={setLoading}
+ />

// Same endpoint still works
POST /api/hybrid-measurements { city: selectedLocation }
```

**No breaking changes:**
- Existing endpoint `/api/hybrid-measurements` unchanged
- Existing data structures compatible
- Gradual migration possible

---

## Implementation Checklist

### Pre-Implementation (Now ✅)
- ✅ Design architecture
- ✅ Plan component structure
- ✅ Plan API endpoints
- ✅ Define caching strategy

### Phase 1: Backend APIs
- [ ] Implement `/api/hierarchy/countries`
- [ ] Implement `/api/hierarchy/search`
- [ ] Implement hierarchical endpoints
- [ ] Add caching layer

### Phase 2: Frontend Components
- [ ] Build AQISearchDropdown component
- [ ] Implement Tier 1 local search
- [ ] Integrate Tier 2 backend search
- [ ] Add coverage badges
- [ ] Test keyboard navigation

### Phase 3: Refinement
- [ ] Performance optimization
- [ ] Mobile testing
- [ ] Analytics integration
- [ ] Empty state improvements
- [ ] Accessibility audit (WCAG 2.1)

---

## Success Criteria

| Criterion | Target | Priority |
|-----------|--------|----------|
| Search response (local) | <50ms | High |
| Search response (backend) | <500ms | High |
| Cache hit rate | >70% | Medium |
| Mobile performance | LCP <2s | Medium |
| Keyboard navigation | 100% usable | Medium |
| Accessibility | WCAG 2.1 AA | Low |

---

**Status:** ✅ Architecture Designed - Ready for Backend Implementation

**Next:** Proceed to Phase 1 (Backend API implementation)
