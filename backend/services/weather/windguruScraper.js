import axios from 'axios';
import { getCached, setCached } from './cache.js';

// Parses Windguru's free monospace embed (micro.windguru.cz, m=all). The block holds
// ONE table per weather model; each model has its OWN column header (9–12 columns), so
// we build a per-block name→index map and read values by name. Wave models (no WSPD
// column) are skipped. The date cursor resets per block from that block's init, which
// is what keeps each model's dates correct (the old single-cursor parser bled later
// tables into phantom future months).

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LENGTH = (y, m) =>
  m === 1 ? (((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 29 : 28)
          : [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m];

const LOCATION_RE = /^(.+?),\s+lat:\s*(-?\d+\.?\d*),\s+lon:\s*(-?\d+\.?\d*)(?:,\s+alt:\s*(-?\d+))?(?:,\s+SST:\s*(-?\d+)\s*C)?/m;
// "GFS 13 km (init: 2026-07-09 00 UTC)" / "IFS-HRES 9 km (init: …)"
const MODEL_RE = /^(\S+)\s+([\d.]+)\s*km\s+\(init:\s*(\d{4})-(\d{2})-(\d{2})\s+(\d{2})\s*UTC\)/;
const ROW_RE = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/;
const DAY_TOKEN_RE = /^(\d{1,2})\.$/;
const HOUR_TOKEN_RE = /^(\d{1,2})h$/;

const num = (s) => (s == null || s === '-' || s === '') ? null : (Number.isFinite(Number(s)) ? Number(s) : null);
const isCardinal = (s) => /^(N|NNE|NE|ENE|E|ESE|SE|SSE|S|SSW|SW|WSW|W|WNW|NW|NNW)$/.test(s || '');
const modelKey = (name, resKm) => `${name.split('-')[0].toLowerCase()}${parseInt(resKm, 10)}`;

const parseBlock = (name, resKm, init, body) => {
  const headerLine = body.find((l) => l.trim().split(/\s+/)[0] === 'Date');
  if (!headerLine) return null;
  const cols = headerLine.trim().split(/\s+/).slice(1); // drop "Date"
  const idx = {};
  cols.forEach((c, i) => { idx[c] = i; });
  if (idx.WSPD == null) return null; // wave model — no wind speed column

  let cy = init.y, cm = init.mo, lastDay = init.d;
  const hours = [];
  for (const raw of body) {
    const line = raw.trim();
    if (!ROW_RE.test(line)) continue;
    const tk = line.split(/\s+/);
    if (tk.length < 4 || !DAY_NAMES.includes(tk[0])) continue;
    const dM = tk[1].match(DAY_TOKEN_RE);
    const hM = tk[2].match(HOUR_TOKEN_RE);
    if (!dM || !hM) continue;
    const day = Number(dM[1]);
    const hour = Number(hM[1]);
    if (day < lastDay - 7) { cm += 1; if (cm > 11) { cm = 0; cy += 1; } }
    lastDay = day;
    if (day < 1 || day > MONTH_LENGTH(cy, cm)) continue;

    const v = tk.slice(3);
    const at = (c) => (idx[c] == null ? null : v[idx[c]]);
    const wdirn = at('WDIRN');
    hours.push({
      dateLocal: `${cy}-${String(cm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      timeLocal: `${String(hour).padStart(2, '0')}:00`,
      dayName: tk[0], day, hour,
      wspdKn: num(at('WSPD')),
      gustKn: num(at('GUST')),
      dirText: isCardinal(wdirn) ? wdirn : null,
      dirDeg: num(at('WDEG')),
      tempC: num(at('TMP')),
      pressureHpa: num(at('SLP')),
      cloudHighPct: num(at('HCLD')),
      cloudMidPct: num(at('MCLD')),
      cloudLowPct: num(at('LCLD')),
      precip3hMm: num(at('APCP')),
      precip1hMm: num(at('APCP1')),
      humidityPct: num(at('RH')),
    });
  }
  if (!hours.length) return null;
  return {
    key: modelKey(name, resKm),
    name,
    resolution: `${resKm} km`,
    initUtcIso: `${init.y}-${String(init.mo + 1).padStart(2, '0')}-${String(init.d).padStart(2, '0')}T${String(init.hh).padStart(2, '0')}:00:00Z`,
    hours,
  };
};

export const parseAllModels = (html) => {
  const preStart = html.indexOf('<pre>');
  const preEnd = html.indexOf('</pre>');
  if (preStart === -1 || preEnd === -1) throw new Error('Missing <pre> block in Windguru response');
  const text = html.slice(preStart + 5, preEnd)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

  const loc = text.match(LOCATION_RE);
  if (!loc) throw new Error('Unable to parse location header');
  const [, location, latStr, lonStr, altStr, sstStr] = loc;

  const blocks = [];
  let cur = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const mm = line.trim().match(MODEL_RE);
    if (mm) { cur = { header: mm, body: [] }; blocks.push(cur); continue; }
    if (cur) cur.body.push(line);
  }

  const models = [];
  for (const blk of blocks) {
    const [, name, resKm, y, mo, d, hh] = blk.header;
    const model = parseBlock(name, resKm, { y: +y, mo: +mo - 1, d: +d, hh: +hh }, blk.body);
    if (model) models.push(model);
  }
  if (!models.length) throw new Error('No wind models parsed from Windguru response');

  return {
    location: location.trim(),
    lat: Number(latStr),
    lon: Number(lonStr),
    altM: altStr != null ? Number(altStr) : null,
    sstC: sstStr != null ? Number(sstStr) : null,
    tzOffsetHours: 3,
    models,
  };
};

const FREE_EMBED_URL = 'https://micro.windguru.cz/';

export const fetchWindguruModels = async ({ spotId, lang = 'en' }) => {
  const cacheKey = `windguru:models:${spotId}:${lang}`;
  const cached = getCached(cacheKey);
  if (cached) return { ...cached, cached: true };

  const params = new URLSearchParams({ s: String(spotId), m: 'all', tz: 'auto', wj: 'knots', tj: 'c', lng: lang });
  const { data: html } = await axios.get(`${FREE_EMBED_URL}?${params.toString()}`, {
    timeout: 12_000,
    headers: { 'User-Agent': 'PlannivoWindReport/1.0 (+https://ukc.plannivo.com)', Accept: 'text/html,application/xhtml+xml' },
    responseType: 'text',
  });

  const parsed = parseAllModels(html);
  const result = { ...parsed, fetchedAt: new Date().toISOString() };
  setCached(cacheKey, result);
  return { ...result, cached: false };
};
