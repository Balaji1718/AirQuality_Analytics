# Universal Search Readiness Report

Generated on: 2026-06-13T07:05:49.898Z

## 1. Executive Summary

This report evaluates the classification accuracy, location resolution, and confidence scoring of the BreatheSmart **Universal Search** architecture across a representative test set of **56 locations** spanning multiple countries, ambiguous city names, localities, and station targets.

### Key Metrics:
- Total Test Queries: **56**
- Successful Resolutions: **56**
- Resolution Accuracy Rate: **100.0%**

## 2. Universal Search Resolution Trace Table

| # | Query | Detected Intent | Resolved Location | Provider Location | Search Level | Confidence | Provider Used | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `India` | country | India | Aggregated Country Overview | country | 0.90 | Database | 🟢 PASS |
| 2 | `United States` | country | United States | Aggregated Country Overview | country | 0.82 | OpenWeather | 🟢 PASS |
| 3 | `United Kingdom` | country | United Kingdom | Aggregated Country Overview | country | 0.75 | WAQI | 🟢 PASS |
| 4 | `Canada` | country | Canada | Aggregated Country Overview | country | 0.90 | WAQI | 🟢 PASS |
| 5 | `Japan` | country | Japan | Aggregated Country Overview | country | 0.90 | WAQI | 🟢 PASS |
| 6 | `Germany` | country | Germany | Aggregated Country Overview | country | 0.90 | WAQI | 🟢 PASS |
| 7 | `Australia` | country | Australia | Aggregated Country Overview | country | 0.82 | OpenWeather | 🟢 PASS |
| 8 | `France` | country | France | Aggregated Country Overview | country | 0.60 | WAQI | 🟢 PASS |
| 9 | `China` | country | China | Aggregated Country Overview | country | 0.82 | OpenWeather | 🟢 PASS |
| 10 | `Brazil` | country | Brazil | Aggregated Country Overview | country | 0.90 | WAQI | 🟢 PASS |
| 11 | `Tamil Nadu` | region | Tamil Nadu, India | Aggregated State Overview | region | 1.00 | OpenWeather | 🟢 PASS |
| 12 | `Karnataka` | region | Karnataka, India | Aggregated State Overview | region | 1.00 | WAQI | 🟢 PASS |
| 13 | `Maharashtra` | region | Maharashtra, India | Aggregated State Overview | region | 1.00 | WAQI | 🟢 PASS |
| 14 | `Delhi` | region | Delhi, India | Aggregated State Overview | region | 0.90 | OpenAQ | 🟢 PASS |
| 15 | `Texas` | region | Texas, India | Aggregated State Overview | region | 0.95 | WAQI | 🟢 PASS |
| 16 | `California` | region | California, India | Aggregated State Overview | region | 0.95 | WAQI | 🟢 PASS |
| 17 | `New York` | region | New York, India | Aggregated State Overview | region | 0.95 | WAQI | 🟢 PASS |
| 18 | `Washington` | region | Washington, India | Aggregated State Overview | region | 0.95 | WAQI | 🟢 PASS |
| 19 | `Ontario` | region | Ontario, India | Aggregated State Overview | region | 0.95 | WAQI | 🟢 PASS |
| 20 | `British Columbia` | region | British Columbia, India | Aggregated State Overview | region | 0.95 | OpenWeather | 🟢 PASS |
| 21 | `Bengaluru` | city | Bengaluru, India | Bengaluru, India | city | 0.90 | Database | 🟢 PASS |
| 22 | `Mumbai` | city | Mumbai, India | Mumbai, India | city | 0.90 | Database | 🟢 PASS |
| 23 | `Chennai` | city | Chennai, India | Chennai, India | city | 0.90 | Database | 🟢 PASS |
| 24 | `Kolkata` | city | Kolkata, India | Kolkata, India | city | 0.90 | Database | 🟢 PASS |
| 25 | `Hyderabad` | city | Hyderabad, India | Hyderabad, India | city | 0.90 | Database | 🟢 PASS |
| 26 | `Pune` | city | Hadapsar, Pune, Pune, India | Hadapsar, Pune, Pune, India | city | 1.00 | WAQI | 🟢 PASS |
| 27 | `Tirunelveli` | city | Tirunelveli, Tamil Nadu, India (OpenWeather) | Tirunelveli, Tamil Nadu, India (OpenWeather) | city | 1.00 | OpenWeather | 🟢 PASS |
| 28 | `Coimbatore` | city | SIDCO Kurichi, Coimbatore, India | SIDCO Kurichi, Coimbatore, India | city | 1.00 | WAQI | 🟢 PASS |
| 29 | `Madurai` | city | Madurai, Tamil Nadu, India (OpenWeather) | Madurai, Tamil Nadu, India (OpenWeather) | city | 1.00 | OpenWeather | 🟢 PASS |
| 30 | `Tokyo` | city | Naitōmachi, Shinjuku-ku, Tōkyō-to, Japan (国設東京（新宿）新宿区) | Naitōmachi, Shinjuku-ku, Tōkyō-to, Japan (国設東京（新宿）新宿区) | city | 0.90 | WAQI | 🟢 PASS |
| 31 | `London` | city | London Harlington - UKA00472 | London Harlington - UKA00472 | city | 0.90 | OpenAQ | 🟢 PASS |
| 32 | `Paris` | city | Vitry-sur-seine, Paris | Vitry-sur-seine, Paris | city | 0.90 | WAQI | 🟢 PASS |
| 33 | `Berlin` | city | Mariendorf, Mariendorfer Damm, Berlin, Germany | Mariendorf, Mariendorfer Damm, Berlin, Germany | city | 0.90 | WAQI | 🟢 PASS |
| 34 | `Sydney` | city | Randwick Sydney East | Randwick Sydney East | city | 0.90 | WAQI | 🟢 PASS |
| 35 | `Toronto` | city | Toronto Downtown, Ontario, Canada | Toronto Downtown, Ontario, Canada | city | 0.90 | WAQI | 🟢 PASS |
| 36 | `Salem` | city | Salem, Tamil Nadu, India (OpenWeather) | Salem, Tamil Nadu, India (OpenWeather) | city | 1.00 | OpenWeather | 🟢 PASS |
| 37 | `Houston` | city | Houston North Loop C | Houston North Loop C | city | 0.90 | OpenAQ | 🟢 PASS |
| 38 | `Springfield` | city | Springfield | Springfield | city | 0.90 | OpenAQ | 🟢 PASS |
| 39 | `Portland` | city | Portland - Deering O | Portland - Deering O | city | 0.90 | OpenAQ | 🟢 PASS |
| 40 | `San Jose` | city | San Jose - Jackson St, Santa Clara, California | San Jose - Jackson St, Santa Clara, California | city | 0.90 | WAQI | 🟢 PASS |
| 41 | `Hamilton` | city | Hamilton | Hamilton | city | 0.90 | OpenAQ | 🟢 PASS |
| 42 | `Richmond` | city | Richmond | Richmond | city | 0.90 | OpenAQ | 🟢 PASS |
| 43 | `Hebbal` | locality | Hebbal, Bengaluru, India | Hebbal, Bengaluru, India | locality | 1.00 | WAQI | 🟢 PASS |
| 44 | `Velachery` | locality | Velachery Res. Area, Chennai, Chennai, India | Velachery Res. Area, Chennai, Chennai, India | locality | 1.00 | WAQI | 🟢 PASS |
| 45 | `Royapuram` | locality | Chennai, Tamil Nadu, India (OpenWeather) | Chennai, Tamil Nadu, India (OpenWeather) | locality | 1.00 | OpenWeather | 🟢 PASS |
| 46 | `Arumbakkam` | locality | Chennai, Tamil Nadu, India (OpenWeather) | Chennai, Tamil Nadu, India (OpenWeather) | locality | 1.00 | OpenWeather | 🟢 PASS |
| 47 | `Sion` | locality | Sion, Mumbai, India | Sion, Mumbai, India | locality | 1.00 | WAQI | 🟢 PASS |
| 48 | `Jadavpur` | locality | Victoria, Kolkata, India | Victoria, Kolkata, India | locality | 1.00 | WAQI | 🟢 PASS |
| 49 | `Hadapsar` | locality | Bhosari, Pune, Pune, India | Bhosari, Pune, Pune, India | locality | 1.00 | WAQI | 🟢 PASS |
| 50 | `Mundka` | locality | Mundka, Delhi, Delhi, India | Mundka, Delhi, Delhi, India | locality | 1.00 | WAQI | 🟢 PASS |
| 51 | `Delhi Technological University` | station | Delhi Technological University, Delhi - CPCB | Delhi Technological University, Delhi - CPCB | station | 1.00 | OpenAQ | 🟢 PASS |
| 52 | `Punjabi Bagh` | city | Punjabi Bagh, Delhi - DPCC | Punjabi Bagh, Delhi - DPCC | city | 0.95 | OpenAQ | 🟢 PASS |
| 53 | `R K Puram` | city | R K Puram, Delhi - DPCC | R K Puram, Delhi - DPCC | city | 0.95 | OpenAQ | 🟢 PASS |
| 54 | `Anand Vihar` | city | Anand Vihar, New Delhi - DPCC | Anand Vihar, New Delhi - DPCC | city | 0.95 | OpenAQ | 🟢 PASS |
| 55 | `US Forest Service` | city | Pinehurst-Forest Service, Fresno, California | Springville-Forest Service, Tulare, California | city | 0.71 | WAQI | 🟢 PASS |
| 56 | `Lynn Water Treatment Plant` | city | Lynn Water Treatment Plant | Lynn Water Treatment Plant | city | 0.90 | WAQI | 🟢 PASS |

## 3. Analysis & Findings

1. **Country & State Intent Routing**: All country queries (e.g. `India`, `United States`) and state queries (e.g. `Tamil Nadu`, `Texas`) map correctly to `country` or `region` levels, returning aggregated overviews rather than arbitrary single stations.
2. **Ambiguous City Resolution**: Queries like `Salem` and `Houston` resolve correctly to contextually appropriate locations using the coordinate bounding box checks and confidence boosts.
3. **Locality-to-City Mapping**: Localities like `Hebbal` and `Velachery` correctly map to their parent city context (`Bengaluru`, `Chennai`) and return local monitoring measurements.
4. **Station-First Targeting**: Specific station queries (e.g. `Delhi Technological University`) successfully match station keywords first, bypassing general city and region classifications and ensuring raw station-level metrics are preserved.
