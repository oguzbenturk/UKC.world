import axios from 'axios';
import { getCached, setCached } from './cache.js';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTH_LENGTH = (year, month /* 0-11 */) => {
  if (month === 1) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month];
};

// Header example:  "Turkey - Alaçati,  lat: 38.2504, lon: 26.3818, alt: 31, SST: 17 C"
const LOCATION_RE = /^(.+?),\s+lat:\s*(-?\d+\.?\d*),\s+lon:\s*(-?\d+\.?\d*)(?:,\s+alt:\s*(-?\d+))?(?:,\s+SST:\s*(-?\d+)\s*C)?/m;
// Model example: "GFS 13 km (init: 2026-04-22 00 UTC)"
const MODEL_RE = /^(\S+)\s+([\d.]+\s*km)\s+\(init:\s*(\d{4})-(\d{2})-(\d{2})\s+(\d{2})\s*UTC\)/m;
const ROW_PREFIX_RE = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/;
const DAY_TOKEN_RE = /^(\d{1,2})\.$/;
const HOUR_TOKEN_RE = /^(\d{1,2})h$/;

const parseNumOrNull = (s) => {
  if (s == null || s === '-' || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const isCardinal = (s) => /^(N|NNE|NE|ENE|E|ESE|SE|SSE|S|SSW|SW|WSW|W|WNW|NW|NNW)$/.test(s);

const parseForecast = (html) => {
  const preStart = html.indexOf('<pre>');
  const preEnd = html.indexOf('</pre>');
  if (preStart === -1 || preEnd === -1) throw new Error('Missing <pre> block in Windguru response');

  const text = html
    .slice(preStart + 5, preEnd)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  const locMatch = text.match(LOCATION_RE);
  if (!locMatch) throw new Error('Unable to parse location header');
  const [, locationName, latStr, lonStr, altStr, sstStr] = locMatch;
  const lat = Number(latStr);
  const lon = Number(lonStr);
  const alt = altStr != null ? Number(altStr) : null;
  const sstC = sstStr != null ? Number(sstStr) : null;

  const modelMatch = text.match(MODEL_RE);
  if (!modelMatch) throw new Error('Unable to parse model init line');
  const [, modelName, modelRes, yyyy, mm, dd, hh] = modelMatch;
  const initUtcIso = `${yyyy}-${mm}-${dd}T${hh}:00:00Z`;
  const initYear = Number(yyyy);
  const initMonth = Number(mm) - 1;
  const initDay = Number(dd);

  const lines = text.split('\n');
  let cursorYear = initYear;
  let cursorMonth = initMonth;
  let lastDay = initDay;

  const hours = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (!ROW_PREFIX_RE.test(line)) continue;

    const tokens = line.split(/\s+/);
    if (tokens.length < 5) continue;
    const dayName = tokens[0];
    if (!DAY_NAMES.includes(dayName)) continue;

    const dayMatch = tokens[1].match(DAY_TOKEN_RE);
    const hourMatch = tokens[2].match(HOUR_TOKEN_RE);
    if (!dayMatch || !hourMatch) continue;
    const day = Number(dayMatch[1]);
    const hour = Number(hourMatch[1]);

    if (day < lastDay - 7) {
      cursorMonth += 1;
      if (cursorMonth > 11) {
        cursorMonth = 0;
        cursorYear += 1;
      }
    }
    lastDay = day;

    if (day < 1 || day > MONTH_LENGTH(cursorYear, cursorMonth)) continue;

    const vals = tokens.slice(3);
    if (vals.length < 12) continue;

    const wspd = parseNumOrNull(vals[0]);
    const gust = parseNumOrNull(vals[1]);
    const wdirn = isCardinal(vals[2]) ? vals[2] : null;
    const wdeg = parseNumOrNull(vals[3]);
    const tmp = parseNumOrNull(vals[4]);
    const slp = parseNumOrNull(vals[5]);
    const hcld = parseNumOrNull(vals[6]);
    const mcld = parseNumOrNull(vals[7]);
    const lcld = parseNumOrNull(vals[8]);
    const apcp3h = parseNumOrNull(vals[9]);
    const apcp1h = parseNumOrNull(vals[10]);
    const rh = parseNumOrNull(vals[11]);

    const dateStr = `${cursorYear}-${String(cursorMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const timeStr = `${String(hour).padStart(2, '0')}:00`;

    hours.push({
      dateLocal: dateStr,
      timeLocal: timeStr,
      dayName,
      day,
      hour,
      wspdKn: wspd,
      gustKn: gust,
      dirText: wdirn,
      dirDeg: wdeg,
      tempC: tmp,
      pressureHpa: slp,
      cloudHighPct: hcld,
      cloudMidPct: mcld,
      cloudLowPct: lcld,
      precip3hMm: apcp3h,
      precip1hMm: apcp1h,
      humidityPct: rh,
    });
  }

  if (hours.length === 0) throw new Error('No hourly data parsed from Windguru response');

  return {
    location: locationName.trim(),
    lat,
    lon,
    altM: alt,
    sstC,
    model: {
      name: modelName,
      resolution: modelRes,
      initUtcIso,
    },
    tzOffsetHours: 3,
    hours,
  };
};

const FREE_EMBED_URL = 'https://micro.windguru.cz/';

export const fetchWindguruForecast = async ({ spotId, windUnit = 'knots', tempUnit = 'c', lang = 'en' }) => {
  const cacheKey = `windguru:${spotId}:${windUnit}:${tempUnit}:${lang}`;
  const cached = getCached(cacheKey);
  if (cached) return { ...cached, cached: true };

  const params = new URLSearchParams({
    s: String(spotId),
    m: 'all',
    tz: 'auto',
    wj: windUnit,
    tj: tempUnit,
    lng: lang,
  });
  const url = `${FREE_EMBED_URL}?${params.toString()}`;

  const { data: html } = await axios.get(url, {
    timeout: 12_000,
    headers: {
      'User-Agent': 'PlannivoWindReport/1.0 (+https://ukc.plannivo.com)',
      Accept: 'text/html,application/xhtml+xml',
    },
    responseType: 'text',
  });

  const parsed = parseForecast(html);
  const result = { ...parsed, fetchedAt: new Date().toISOString(), cached: false };
  setCached(cacheKey, { ...parsed, fetchedAt: result.fetchedAt });
  return result;
};
