import axios from 'axios';
import { getCached, setCached } from './cache.js';

/**
 * UKC's own Windguru weather station (Urla Kite Center, Gülbahçe) — the live
 * "current conditions" reading shown on the Wind Report page.
 *
 * Unlike windguruScraper.js (which scrapes the public *forecast*), this hits the
 * Windguru Station API `station_data_current` for the station UKC owns, returning
 * the real-time measured wind/temp. We proxy it through the backend to keep the
 * station credential out of client code and to cache responses.
 *
 * The station password is a SECRET and must be supplied via the environment —
 * never hardcode it (it ends up in git history). Set:
 *   UKC_WINDGURU_STATION_ID       (the station id, e.g. 539 — not secret)
 *   UKC_WINDGURU_STATION_PASSWORD (the station read password — secret, required)
 */
const STATION_ID = process.env.UKC_WINDGURU_STATION_ID || '539';
const STATION_PASSWORD = process.env.UKC_WINDGURU_STATION_PASSWORD;
const CACHE_KEY = `windguru:station:${STATION_ID}:current`;
const TTL_MS = 5 * 60 * 1000; // station updates ~every few minutes; 5-min cache is plenty

const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

const degToCardinal = (deg) => {
  const n = Number(deg);
  if (!Number.isFinite(n)) return null;
  return DIRS[Math.round(((n % 360) + 360) % 360 / 22.5) % 16];
};

const round1 = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 10) / 10 : null);

/**
 * Map an average wind speed (knots) to a rideability state. Buckets follow the
 * legacy UKC badge thresholds (js/wing.js logo_color): aqua / green / yellow / red.
 */
const windState = (kts) => {
  if (!Number.isFinite(kts)) return 'unknown';
  if (kts < 6) return 'calm';
  if (kts < 10) return 'light';
  if (kts < 18) return 'good';
  if (kts <= 22) return 'strong';
  return 'extreme';
};

// Coalesce concurrent cold-cache callers onto a single upstream request so a slow
// or down Windguru can't trigger a pile-up of 10s connections (thundering herd).
let inflight = null;

const fetchFromWindguru = async () => {
  if (!STATION_PASSWORD) {
    throw new Error(
      'UKC_WINDGURU_STATION_PASSWORD is not set — the live wind station cannot be queried. ' +
        'Set it in the backend environment.'
    );
  }

  const url =
    `https://www.windguru.cz/int/wgsapi.php?id_station=${encodeURIComponent(STATION_ID)}` +
    `&password=${encodeURIComponent(STATION_PASSWORD)}&q=station_data_current`;

  const { data } = await axios.get(url, {
    timeout: 10_000,
    headers: {
      'User-Agent': 'PlannivoWindReport/1.0 (+https://ukc.plannivo.com)',
      Accept: 'application/json',
    },
  });

  if (!data || typeof data.wind_avg !== 'number') {
    throw new Error('Windguru station returned no current data');
  }

  const windAvgKts = round1(data.wind_avg);
  const result = {
    stationId: Number(STATION_ID),
    windAvgKts,
    windMaxKts: round1(data.wind_max),
    windMinKts: round1(data.wind_min),
    directionDeg: Number.isFinite(Number(data.wind_direction)) ? Number(data.wind_direction) : null,
    directionText: degToCardinal(data.wind_direction),
    temperatureC: round1(data.temperature),
    humidityPct: Number.isFinite(Number(data.rh)) ? Math.round(Number(data.rh)) : null,
    pressureHpa: Number.isFinite(Number(data.mslp)) ? Math.round(Number(data.mslp)) : null,
    state: windState(windAvgKts),
    datetime: data.datetime || null,
    unixtime: Number.isFinite(Number(data.unixtime)) ? Number(data.unixtime) : null,
    fetchedAt: new Date().toISOString(),
  };

  setCached(CACHE_KEY, result, TTL_MS);
  return result;
};

/**
 * Fetch UKC's live station reading (cached 5 min). The Windguru station endpoint
 * already returns wind in knots for this station, matching the legacy site.
 * @returns {Promise<object>} normalized current conditions
 */
export const getUkcLive = async () => {
  const cached = getCached(CACHE_KEY);
  if (cached) return { ...cached, cached: true };

  if (!inflight) {
    inflight = fetchFromWindguru().finally(() => { inflight = null; });
  }
  const result = await inflight;
  return { ...result, cached: false };
};
