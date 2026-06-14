# REAL AQI Hierarchy Coverage Analysis Report

Generated: 2026-06-10T05:27:43.850Z

## Scope and Validation
- Uses only runtime/discovered artifacts currently present in this workspace.
- Distinguishes true administrative hierarchy from synthetic/fallback nodes.
- Does not assume hierarchy depth beyond explicit provider-discovered data.

## Core Metrics
- Total federation countries: 193
- Total cleaned effective countries: 37
- Total cleaned states/regions: 40
- Cleaned administrative regions: 0
- Cleaned provider-locality regions: 0
- Cleaned synthetic fallback regions: 0
- Total real administrative regions: 7
- Total synthetic regions: 173
- Total pseudo regions: 193
- Total capital-only fallback regions: 173
- Total cleaned cities: 12490
- Provider overlap nodes: 160
- Fallback activation frequency (node-level): 173
- Fallback-only country count: 173
- Enriched-country count (WAQI available): 16
- Hierarchy restoration success rate: 100%
- Hierarchy completeness score: 68.28
- Hierarchy authenticity score: 22.57

## Provider-Level Comparison
- OpenWeather-only fallback coverage countries: 173
- WAQI-enhanced coverage countries: 16
- OpenAQ effective contribution (federation countries): 0
- OpenAQ effective contribution (cleaned hierarchy countries): 30
- Provider redundancy quality overlap ratio: 42.9%
- Provider dependency concentration: OpenWeather 100%, WAQI 8.29%, OpenAQ 0%

## Hierarchy Quality Observations
- Cross-country leak signatures remain high in cleaned validation (415 leak labels).
- Region == city duplication patterns detected: 8.
- Duplicated hierarchy layer patterns detected: 8.

- OpenWeather appears in 193/193 federation countries.
- WAQI appears in 16/193 federation countries.
- OpenAQ is inactive in federation map (0/193 countries with OpenAQ available status).

## Cleanup Impact Observations
- Country retention after cleanup: 37/37.
- Unknown placeholder states normalized: 30.
- Malformed country keys removed: 3.
- Station-label removals: 2430.
- Invalid coordinate removals: 0.
- Within-state duplicate removals: 90.
- Fallback-only countries remain: 173.
- OpenAQ inactive countries in federation map: 193.

## Strongest Countries by Effective Depth (Top 15)
- India: 2 states, 417 cities, providers=OpenAQ, OpenWeather
- China: 2 states, 417 cities, providers=OpenAQ, OpenWeather
- France: 2 states, 417 cities, providers=OpenAQ, OpenWeather
- Indonesia: 1 states, 416 cities, providers=OpenAQ
- Malaysia: 1 states, 416 cities, providers=OpenAQ
- Chile: 1 states, 416 cities, providers=OpenAQ
- Peru: 1 states, 416 cities, providers=OpenAQ
- Argentina: 1 states, 416 cities, providers=OpenAQ
- Dhekelia: 1 states, 416 cities, providers=OpenAQ
- Cyprus: 1 states, 416 cities, providers=OpenAQ
- Israel: 1 states, 416 cities, providers=OpenAQ
- Palestine: 1 states, 416 cities, providers=OpenAQ
- Lebanon: 1 states, 416 cities, providers=OpenAQ
- Ethiopia: 1 states, 416 cities, providers=OpenAQ
- South Sudan: 1 states, 416 cities, providers=OpenAQ

## Weakest Countries by Effective Depth (Top 15)
- Japan: 1 states, 1 cities, providers=OpenWeather
- United States: 1 states, 1 cities, providers=OpenWeather
- United Kingdom: 1 states, 1 cities, providers=OpenWeather
- Brazil: 1 states, 1 cities, providers=OpenWeather
- United Arab Emirates: 1 states, 1 cities, providers=OpenWeather
- Egypt: 1 states, 1 cities, providers=OpenWeather
- Australia: 1 states, 1 cities, providers=OpenWeather
- Indonesia: 1 states, 416 cities, providers=OpenAQ
- Malaysia: 1 states, 416 cities, providers=OpenAQ
- Chile: 1 states, 416 cities, providers=OpenAQ
- Peru: 1 states, 416 cities, providers=OpenAQ
- Argentina: 1 states, 416 cities, providers=OpenAQ
- Dhekelia: 1 states, 416 cities, providers=OpenAQ
- Cyprus: 1 states, 416 cities, providers=OpenAQ
- Israel: 1 states, 416 cities, providers=OpenAQ

## Validation Rules Applied
- Administrative regions are considered true only when region names are explicitly discovered in raw hierarchy state keys for the same country.
- Capital/Center and General Region nodes are treated as synthetic fallback/normalization constructs.
- No city is treated as an administrative region unless explicit state evidence exists in discovered provider data.