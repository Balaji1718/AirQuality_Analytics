# Search Ranking Strategy Design

This document details the ranking rules, scoring weights, and deduplication logic for compiling universal autocomplete suggestions.

---

## 1. Score Calculation Formula

Suggestions are scored and sorted based on three primary metrics: **Text Similarity**, **Entity Type Priority**, and **Verification/Data Availability**.

$$\text{Final Score} = (\text{Text Score} \times w_{\text{text}}) + (\text{Type Score} \times w_{\text{type}}) + \text{Bonus}$$

Where:
- $w_{\text{text}} = 0.6$ (Text similarity weight)
- $w_{\text{type}} = 0.4$ (Entity type weight)

---

## 2. Scoring Parameter Details

### 1. Text Similarity Score (0.0 - 1.0)
Calculated using a combination of Levenshtein distance and substring index checks:
- **Substring Match**: If the query matches the start of a suggestion word, it is assigned a score of `1.0`.
- **Fuzzy Match**: If it's a general fuzzy match, the score is based on Levenshtein distance similarity.
- **Exact Match Bonus**: An additional `+0.20` is added to the score if the query exactly matches the suggestion name (case-insensitive).

### 2. Entity Type Score (0.0 - 1.0)
Prioritizes higher-level nodes to guide broad searches before zooming in to micro-monitoring stations:
- **Country**: `1.0`
- **State / Region**: `0.90`
- **City**: `0.80`
- **Monitoring Station**: `0.65`

### 3. Verification & Data Availability Bonus (+0.10)
- Add `+0.10` if the entity has a flag `hasData` or has been verified as active in our regional coverage indices. This prioritizes responsive sensors over inactive ones.

---

## 3. Deduplication and Aggregation Logic

When querying multiple databases and live APIs in parallel, duplicate results will arise (e.g., searching "Delhi" matches the local city table AND returned WAQI stations). The backend merges duplicates using the following rules:

1. **Identifier Matching**:
   Merge items if their canonical names and countries match.
2. **Promotion Rule**:
   If a generic city matches a specific monitoring station, keep them as separate suggestions but group the station underneath the city context. If a city matches across database and OpenAQ, promote the local database record to carry the OpenAQ `providerLocation` and coordinate markers, keeping only a single, enriched city suggestion.
3. **Truncation Limit**:
   Return a maximum of 10 suggestions (e.g., top 2 Countries, 2 States, 3 Cities, and 3 Stations) to keep the frontend autocomplete lists clean and responsive.
