# Hierarchy Integrity Audit Report

Generated on: 2026-06-13T07:16:29.415Z

## 1. Executive Summary

This audit evaluates the integrity of the locations hierarchy stored in the BreatheSmart PostgreSQL database. We analyzed all **37 countries**, **40 states**, and **12106 cities** to identify synthetic regions, cross-country coordinate contamination, and station labels incorrectly stored as cities.

These findings form the basis of the Universal Search autocomplete sanitization and cleanup roadmap.

## 2. Synthetic & Fallback Regions by Country

Synthetic regions (e.g. containing `unknown_region`, `General Region`, or fallback tags) expose low-quality metadata in the autocomplete drop-downs.

| Country | Synthetic State/Region |
| :--- | :--- |
| Argentina | `General Region` |
| Bhutan | `General Region` |
| Chile | `General Region` |
| China | `General Region` |
| Costa Rica | `General Region` |
| Cyprus | `General Region` |
| Democratic Republic of the Congo | `General Region` |
| Dhekelia | `General Region` |
| Ethiopia | `General Region` |
| France | `General Region` |
| Guyana | `General Region` |
| India | `General Region` |
| Indonesia | `General Region` |
| Israel | `General Region` |
| Kazakhstan | `General Region` |
| Kenya | `General Region` |
| Lebanon | `General Region` |
| Malawi | `General Region` |
| Malaysia | `General Region` |
| Morocco | `General Region` |
| Nicaragua | `General Region` |
| Oman | `General Region` |
| Palestine | `General Region` |
| Peru | `General Region` |
| Republic of Korea | `General Region` |
| Saint-Martin | `General Region` |
| South Africa | `General Region` |
| South Sudan | `General Region` |
| Ukraine | `General Region` |
| Uzbekistan | `General Region` |

## 3. Contaminated Cities Audit

City lists contaminated with foreign coordinates (cross-country bounds mismatch) or raw station labels (e.g. containing CPCB, DPCC, or station codes) create location resolution and ranking errors.

No contaminated cities found.

## 4. Countries with Low State/Region Coverage

Countries with many cities but only 0 or 1 state/region records indicate incomplete structural hierarchy coverage.

| Country | States/Regions Count | Cities Count |
| :--- | :--- | :--- |
| Argentina | 1 | 417 |
| Bhutan | 1 | 417 |
| Chile | 1 | 417 |
| Costa Rica | 1 | 417 |
| Cyprus | 1 | 417 |
| Democratic Republic of the Congo | 1 | 417 |
| Dhekelia | 1 | 417 |
| Ethiopia | 1 | 417 |
| Guyana | 1 | 417 |
| Indonesia | 1 | 417 |
| Israel | 1 | 417 |
| Kazakhstan | 1 | 417 |
| Kenya | 1 | 417 |
| Lebanon | 1 | 417 |
| Malawi | 1 | 417 |
| Malaysia | 1 | 417 |
| Morocco | 1 | 417 |
| Nicaragua | 1 | 417 |
| Oman | 1 | 417 |
| Palestine | 1 | 417 |
| Peru | 1 | 417 |
| Republic of Korea | 1 | 417 |
| Saint-Martin | 1 | 417 |
| South Africa | 1 | 417 |
| South Sudan | 1 | 417 |
| Ukraine | 1 | 417 |
| Uzbekistan | 1 | 417 |

## 5. Country Quality Metrics & Scoreboard

The quality score is calculated by starting at 100, deducting 15 points per synthetic state, 5 points per contaminated city, and 5-10 points for low state coverage.

| Country | State Count | City Count | Contamination Count | Quality Score |
| :--- | :--- | :--- | :--- | :--- |
| Argentina | 1 | 417 | 0 | 🟡 **80 / 100** |
| Bhutan | 1 | 417 | 0 | 🟡 **80 / 100** |
| Chile | 1 | 417 | 0 | 🟡 **80 / 100** |
| Costa Rica | 1 | 417 | 0 | 🟡 **80 / 100** |
| Cyprus | 1 | 417 | 0 | 🟡 **80 / 100** |
| Democratic Republic of the Congo | 1 | 417 | 0 | 🟡 **80 / 100** |
| Dhekelia | 1 | 417 | 0 | 🟡 **80 / 100** |
| Ethiopia | 1 | 417 | 0 | 🟡 **80 / 100** |
| Guyana | 1 | 417 | 0 | 🟡 **80 / 100** |
| Indonesia | 1 | 417 | 0 | 🟡 **80 / 100** |
| Israel | 1 | 417 | 0 | 🟡 **80 / 100** |
| Kazakhstan | 1 | 417 | 0 | 🟡 **80 / 100** |
| Kenya | 1 | 417 | 0 | 🟡 **80 / 100** |
| Lebanon | 1 | 417 | 0 | 🟡 **80 / 100** |
| Malawi | 1 | 417 | 0 | 🟡 **80 / 100** |
| Malaysia | 1 | 417 | 0 | 🟡 **80 / 100** |
| Morocco | 1 | 417 | 0 | 🟡 **80 / 100** |
| Nicaragua | 1 | 417 | 0 | 🟡 **80 / 100** |
| Oman | 1 | 417 | 0 | 🟡 **80 / 100** |
| Palestine | 1 | 417 | 0 | 🟡 **80 / 100** |
| Peru | 1 | 417 | 0 | 🟡 **80 / 100** |
| Republic of Korea | 1 | 417 | 0 | 🟡 **80 / 100** |
| Saint-Martin | 1 | 417 | 0 | 🟡 **80 / 100** |
| South Africa | 1 | 417 | 0 | 🟡 **80 / 100** |
| South Sudan | 1 | 417 | 0 | 🟡 **80 / 100** |
| Ukraine | 1 | 417 | 0 | 🟡 **80 / 100** |
| Uzbekistan | 1 | 417 | 0 | 🟡 **80 / 100** |
| China | 2 | 418 | 0 | 🟢 **85 / 100** |
| France | 2 | 418 | 0 | 🟢 **85 / 100** |
| India | 2 | 4 | 0 | 🟢 **85 / 100** |
| Australia | 1 | 1 | 0 | 🟢 **100 / 100** |
| Brazil | 1 | 1 | 0 | 🟢 **100 / 100** |
| Egypt | 1 | 1 | 0 | 🟢 **100 / 100** |
| Japan | 1 | 1 | 0 | 🟢 **100 / 100** |
| United Arab Emirates | 1 | 1 | 0 | 🟢 **100 / 100** |
| United Kingdom | 1 | 1 | 0 | 🟢 **100 / 100** |
| United States | 1 | 1 | 0 | 🟢 **100 / 100** |
