// Shared time utilities for the backend

/**
 * Parse an HH:MM string or decimal hour number into total minutes.
 * e.g. '08:30' → 510, 8.5 → 510
 */
export function parseHHMM(t) {
  if (typeof t === 'number') return t * 60;
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * Convert a decimal hour value (e.g. 9.5) to an HH:MM string ('09:30').
 */
export function decimalHourToHHMM(decimalHour) {
  const h = Math.floor(decimalHour);
  const m = Math.round((decimalHour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Module-level cache — working hours change essentially never (admin config)
let _whCache = null;
let _whCacheTime = 0;
const WH_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Fetch the configured working hours from settings, with in-process caching.
 * Falls back to 08:00–21:00 on any error.
 */
export async function getWorkingHours(pool) {
  const now = Date.now();
  if (_whCache && now - _whCacheTime < WH_CACHE_TTL_MS) {
    return _whCache;
  }
  try {
    const result = await pool.query(
      "SELECT value FROM settings WHERE key = 'calendar_working_hours'"
    );
    _whCache = result.rows.length > 0
      ? { start: result.rows[0].value.start ?? '08:00', end: result.rows[0].value.end ?? '21:00' }
      : { start: '08:00', end: '21:00' };
  } catch {
    _whCache = { start: '08:00', end: '21:00' };
  }
  _whCacheTime = now;
  return _whCache;
}
