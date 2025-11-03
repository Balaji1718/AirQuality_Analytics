// Utility helpers for pollutant key normalization and numeric coercion
function normalizePollutant(raw) {
  if (!raw && raw !== 0) return null;
  const s = raw.toString().toLowerCase().trim();

  // common variants -> normalized token
  if (s.includes('pm2') || s.includes('pm25') || s.includes('pm_2') || s.includes('pm2.5') ) return 'pm25';
  if (s.includes('pm10') || s.includes('pm_10')) return 'pm10';
  if (s.includes('no2')) return 'no2';
  if (s.includes('so2')) return 'so2';
  if (s.includes('o3') || s.includes('ozone')) return 'o3';
  if (s.includes('co')) return 'co';

  // fallback: remove non alphanum and try match
  const token = s.replace(/[^a-z0-9]/g, '');
  if (token === 'pm25') return 'pm25';
  if (token === 'pm10') return 'pm10';
  if (token === 'no2') return 'no2';
  if (token === 'so2') return 'so2';
  if (token === 'o3') return 'o3';
  if (token === 'co') return 'co';

  return null;
}

function coerceNumber(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  if (typeof v === 'string') {
    // remove commas and non-numeric trailing chars
    const cleaned = v.replace(/,/g, '').match(/[-+]?[0-9]*\.?[0-9]+/);
    if (!cleaned) return null;
    const n = parseFloat(cleaned[0]);
    return isNaN(n) ? null : n;
  }
  return null;
}

module.exports = { normalizePollutant, coerceNumber };
