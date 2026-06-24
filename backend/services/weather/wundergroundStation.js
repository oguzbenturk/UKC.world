import axios from 'axios';
import { getCached, setCached } from './cache.js';

/**
 * UKC's own Weather Underground PWS (Urla Kite Center, Gülbahçe) — the live
 * "current conditions" reading shown on the Wind Report page.
 *
 * This hits the Weather Underground PWS "observations/current" API for the station
 * UKC owns. WU exposes richer ambient fields than Windguru (feels-like, dewpoint,
 * precipitation rate/accumulation, UV, solar), so it is the primary live source.
 * We proxy it through the backend to keep the API key out of client code and to
 * cache responses.
 *
 * The API key is a SECRET and must be supplied via the environment — never hardcode
 * it (it ends up in git history). Set:
 *   WUNDERGROUND_STATION_ID  (the station id, e.g. IURLA24 — not secret)
 *   WUNDERGROUND_API_KEY     (the WU read API key — secret, required)
 */
const STATION_ID = process.env.WUNDERGROUND_STATION_ID || 'IURLA24';
const API_KEY = process.env.WUNDERGROUND_API_KEY;
const CACHE_KEY = `wunderground:pws:${STATION_ID}:current`;
const TTL_MS = 5 * 60 * 1000; // station reports ~every minute; 5-min cache is plenty

const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

const degToCardinal = (deg) => {
  const n = Number(deg);
  if (!Number.isFinite(n)) return null;
  return DIRS[Math.round(((n % 360) + 360) % 360 / 22.5) % 16];
};

const round1 = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 10) / 10 : null);
const roundInt = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);

// WU "metric" units report wind in km/h; the Wind Report UI (and the windState
// buckets / kite-size logic) is knots-based, so normalize here.
const KMH_TO_KTS = 1 / 1.852;
const kmhToKts = (kmh) => (Number.isFinite(Number(kmh)) ? round1(Number(kmh) * KMH_TO_KTS) : null);

/**
 * Map an average wind speed (knots) to a rideability state. Buckets match the
 * Windguru live widget (aqua / green / yellow / red) so the shared STATE_STYLES
 * palette renders identically.
 */
const windState = (kts) => {
  if (!Number.isFinite(kts)) return 'unknown';
  if (kts < 6) return 'calm';
  if (kts < 10) return 'light';
  if (kts < 18) return 'good';
  if (kts <= 22) return 'strong';
  return 'extreme';
};

// "Feels like": WU gives heatIndex (warm) and windChill (cold); pick the relevant
// one, falling back to the dry-bulb temperature in the comfortable middle band.
const feelsLike = (metric) => {
  const temp = Number(metric?.temp);
  if (!Number.isFinite(temp)) return null;
  if (temp >= 26 && Number.isFinite(Number(metric?.heatIndex))) return round1(metric.heatIndex);
  if (temp <= 10 && Number.isFinite(Number(metric?.windChill))) return round1(metric.windChill);
  return round1(temp);
};

// Coalesce concurrent cold-cache callers onto a single upstream request so a slow
// or down Weather Underground can't trigger a pile-up of 10s connections.
let inflight = null;

const fetchFromWunderground = async () => {
  if (!API_KEY) {
    throw new Error(
      'WUNDERGROUND_API_KEY is not set — the live wind station cannot be queried. ' +
        'Set it in the backend environment.'
    );
  }

  const url =
    `https://api.weather.com/v2/pws/observations/current?stationId=${encodeURIComponent(STATION_ID)}` +
    `&format=json&units=m&numericPrecision=decimal&apiKey=${encodeURIComponent(API_KEY)}`;

  const { data } = await axios.get(url, {
    timeout: 10_000,
    headers: {
      'User-Agent': 'PlannivoWindReport/1.0 (+https://ukc.plannivo.com)',
      Accept: 'application/json',
    },
  });

  // WU returns 204 / empty body (or an empty observations array) when the station
  // has no recent reading — i.e. it is offline / not uploading.
  const obs = data?.observations?.[0];
  if (!obs || obs.metric == null) {
    throw new Error('Weather Underground station returned no current data');
  }

  const m = obs.metric;
  const windAvgKts = kmhToKts(m.windSpeed);
  const result = {
    stationId: String(obs.stationID || STATION_ID),
    neighborhood: obs.neighborhood || null,
    windAvgKts,
    windGustKts: kmhToKts(m.windGust),
    directionDeg: Number.isFinite(Number(obs.winddir)) ? Number(obs.winddir) : null,
    directionText: degToCardinal(obs.winddir),
    temperatureC: round1(m.temp),
    feelsLikeC: feelsLike(m),
    humidityPct: roundInt(obs.humidity),
    dewpointC: round1(m.dewpt),
    pressureHpa: roundInt(m.pressure),
    precipRateMm: round1(m.precipRate),
    precipAccumMm: round1(m.precipTotal),
    uv: Number.isFinite(Number(obs.uv)) ? round1(obs.uv) : null,
    solarRadiation: roundInt(obs.solarRadiation),
    state: windState(windAvgKts),
    datetime: obs.obsTimeLocal || null,
    unixtime: Number.isFinite(Number(obs.epoch)) ? Number(obs.epoch) : null,
    fetchedAt: new Date().toISOString(),
  };

  setCached(CACHE_KEY, result, TTL_MS);
  return result;
};

/**
 * Fetch UKC's live Weather Underground reading (cached 5 min). Wind is normalized
 * to knots to match the rest of the Wind Report UI.
 * @returns {Promise<object>} normalized current conditions
 */
export const getPwsLive = async () => {
  const cached = getCached(CACHE_KEY);
  if (cached) return { ...cached, cached: true };

  if (!inflight) {
    inflight = fetchFromWunderground().finally(() => { inflight = null; });
  }
  const result = await inflight;
  return { ...result, cached: false };
};
