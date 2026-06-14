# Universal Search Architecture Design

This document outlines the proposed design for the unified **Universal Search Experience**, enabling users to search for countries, states, cities, localities, and specific monitoring stations from a single input box.

---

## 1. System Overview

Currently, the search workflow relies on multi-step hierarchical dropdowns (Country ➔ State ➔ City). Under the new architecture, the hierarchy dropdowns will become optional advanced filters, replaced by a single input field backed by an autocomplete classifier.

```
                   [ User Input Bar ]
                           │
                           ▼
                 [ GET /api/search?q= ]
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
       [ DB Hierarchy ] [ OpenAQ API ] [ WAQI API ]
       (Country/State/   (Locations    (Stations
            City)          Index)        Search)
             │             │             │
             └─────────────┼─────────────┘
                           ▼
              [ Suggestions Aggregator ]
                           │
                           ▼
              [ Autocomplete Classifier ]
              - Country
              - State / Region
              - City
              - Monitoring Station
                           │
                           ▼
             [ Suggestion Ranking Engine ]
                           │
                           ▼
                  [ Frontend Dropdown ]
```

---

## 2. API Schema Specification

### Endpoint: `GET /api/search?q=<query>&limit=10`

### Response Payload Structure
The endpoint returns an array of classified suggestion objects:
```json
[
  {
    "id": "IN",
    "label": "India",
    "type": "Country",
    "coordinates": null,
    "context": {
      "country": "India"
    }
  },
  {
    "id": "IN-TN",
    "label": "Tamil Nadu, India",
    "type": "State",
    "coordinates": { "lat": 11.1271, "lon": 78.6569 },
    "context": {
      "country": "India",
      "state": "Tamil Nadu"
    }
  },
  {
    "id": "IN-TN-Chennai",
    "label": "Chennai, Tamil Nadu, India",
    "type": "City",
    "coordinates": { "lat": 13.0827, "lon": 80.2707 },
    "context": {
      "country": "India",
      "state": "Tamil Nadu",
      "city": "Chennai"
    }
  },
  {
    "id": "WAQI-13740",
    "label": "Arumbakkam, Chennai, India",
    "type": "Station",
    "coordinates": { "lat": 13.0664, "lon": 80.2112 },
    "context": {
      "country": "India",
      "state": "Tamil Nadu",
      "city": "Chennai",
      "stationId": "13740",
      "provider": "WAQI"
    }
  }
]
```

---

## 3. Classification Engine Rules

Suggestions are classified based on their source origin and database attributes:

1. **Country**:
   - Matches a row in the `countries` database table or matches a known global ISO country alias.
2. **State / Region**:
   - Matches a row in the `states` database table, or contains standard regional signatures (e.g. state code suffixes).
3. **City**:
   - Matches a row in the `cities` database table, or matches `inferredCity` bounds in local geography indexes.
4. **Monitoring Station**:
   - Resolved from live provider indices (OpenAQ locations / WAQI stations index) that contain specific hardware ids (`location.id` or `station.uid`). Marked with a satellite/sensor icon (`📡`) in the UI.
