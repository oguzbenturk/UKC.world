# Windguru-grade Forecast — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the GFS-only forecast with a multi-model parse (all Windguru models), a median "UKC Mix" default, a dense Windguru-style grid UI with model tabs, and a per-model accuracy loop scored against the beach station.

**Architecture:** Backend rewrites the Windguru scraper to parse every model block by its own column header (fixes the "GFS only" bug), adds a `mix.js` median blender, and serves a per-spot forecast whose default `hours` = UKC Mix with raw models available per-tab. A snapshot cron records predictions; an accuracy endpoint scores them against `wind_history`. Frontend replaces the per-day curves with a `ForecastGrid` + `ModelTabs` in every spot card.

**Tech Stack:** Node/Express (ESM), PostgreSQL, node-cron, Jest (backend), React 18 + TanStack Query, Vitest (frontend pure utils), Tailwind + existing wind-band theme.

**Spec:** `docs/superpowers/specs/2026-07-09-windguru-grade-forecast-design.md`

## Global Constraints

- ESM modules everywhere (`import`/`export`), both frontend and backend.
- Wind unit is **knots** only; scraper always fetches `wj=knots`.
- Never break the existing `forecast.hours` per-hour shape — `verdict.js` (`dailySummary`/`groupByDay`/`bestWindow`), kite-size, and best-today ranking consume it unchanged. Per-hour keys: `dateLocal, timeLocal, dayName, day, hour, wspdKn, gustKn, dirText, dirDeg, tempC, pressureHpa, cloudHighPct, cloudMidPct, cloudLowPct, precip3hMm, precip1hMm, humidityPct` (Mix adds `sources: string[]`).
- Wind bands come from `src/features/wind-report/utils/windBands.js` (`getWindBand`) + `bandTheme.js` (`WR_SOFT`/`WR_TEXT`/`WR_HEX`). Colour is **never** shown without its number.
- App UI is light theme. Do not add dark styles.
- Run `npm run migrate:up` immediately after creating any migration (project rule).
- Never run `npm run build` to verify (project rule). Verify frontend by dev render / unit tests only.
- No runtime tests against live users/notifications. Weather endpoints are read-only; new tables append-only.
- Backend Jest tests: `backend/<dir>/__tests__/<name>.test.js`, header `/* eslint-env jest */`, run from `backend/` via `npm test -- <path-substring>`.
- Frontend Vitest tests: `tests/unit/frontend/windReport/<name>.test.js`, `import { describe, it, expect } from 'vitest'`, `@/` alias. Run `npx vitest run <path>`.
- End every commit message with the co-author trailer:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Structure

**Backend (create)**
- `backend/services/weather/modelOrder.js` — `MODEL_ORDER` constant (shared; breaks the index↔accuracy cycle).
- `backend/services/weather/cardinal.js` — `degToCardinal(deg)` shared helper.
- `backend/services/weather/mix.js` — `median`, `circularMeanDeg`, `buildMix(models)`.
- `backend/services/weather/accuracy.js` — `computeMae(pairs)`, `getModelAccuracy(spotId,opts)`.
- `backend/jobs/forecastSnapshotJob.js` — cron recorder.
- `backend/db/migrations/287_create_forecast_snapshots.sql`
- `backend/services/weather/__fixtures__/windguru-574666.html` — frozen scrape.
- `backend/services/weather/__tests__/windguruScraper.test.js`
- `backend/services/weather/__tests__/mix.test.js`
- `backend/services/weather/__tests__/accuracy.test.js`

**Backend (modify)**
- `backend/services/weather/windguruScraper.js` — rewrite to multi-model parse.
- `backend/services/weather/index.js` — mix-default report + per-model + accuracy exports; `MODEL_ORDER`.
- `backend/services/weather/spots.js` — add `station: 'IURLA24'` to gulbahce.
- `backend/routes/weather.js` — `model` param on report, `/models/accuracy`, use `cardinal.js`.
- `backend/server.js` — start snapshot cron.

**Frontend (create)**
- `src/features/wind-report/utils/models.js` — `MODEL_ORDER`, `MODEL_LABEL`, `MIX_KEY`.
- `src/features/wind-report/utils/forecastGrid.js` — pure grid helpers.
- `src/features/wind-report/components/ForecastGrid.jsx`
- `src/features/wind-report/components/ModelTabs.jsx`
- `src/features/wind-report/hooks/useSpotModelSeries.js`
- `src/features/wind-report/hooks/useModelAccuracy.js`
- `tests/unit/frontend/windReport/forecastGrid.test.js`

**Frontend (modify)**
- `src/features/wind-report/services/windReportService.js` — `fetchSpotModelSeries`, `fetchModelAccuracy`.
- `src/features/wind-report/components/SpotCard.jsx` — tabs + grid, model state.
- `public/locales/{en,tr,de,es,fr,ru}/common.json` — `windReport.grid.*`, `windReport.models.*`.

**Frontend (delete)**
- `src/features/wind-report/components/DayStrip.jsx` (only used by SpotCard).
- `src/features/wind-report/components/WindCurve.jsx` (only used by DayStrip).
  (`WindBandPaths.jsx` + `curveGeometry.js` stay — `WindHistoryChart` uses them.)

---

## Task 1: Multi-model Windguru parser

**Files:**
- Modify: `backend/services/weather/windguruScraper.js` (full rewrite)
- Create: `backend/services/weather/__fixtures__/windguru-574666.html`
- Test: `backend/services/weather/__tests__/windguruScraper.test.js`

**Interfaces:**
- Produces: `parseAllModels(html) → { location, lat, lon, altM, sstC, tzOffsetHours:3, models: Model[] }` where `Model = { key, name, resolution, initUtcIso, hours: Hour[] }`, `key ∈ {gfs13, ifs9, wrf3, wrf9, icon7, icon13, gdps15}` (wave models excluded), `Hour` = the standard per-hour shape (Global Constraints).
- Produces: `fetchWindguruModels({ spotId, lang }) → { ...parseAllModels result, fetchedAt, cached }` (cached 30 min via `cache.js`).

- [ ] **Step 1: Capture the fixture**

Run (from repo root):
```bash
mkdir -p backend/services/weather/__fixtures__
curl -s "https://micro.windguru.cz/?s=574666&m=all&tz=auto&wj=knots&tj=c&lng=en" \
  -H "User-Agent: PlannivoWindReport/1.0 (+https://ukc.plannivo.com)" \
  -o backend/services/weather/__fixtures__/windguru-574666.html
grep -c "(init:" backend/services/weather/__fixtures__/windguru-574666.html
```
Expected: prints `10` (ten model blocks). If it prints `0`, the fetch failed — retry.

- [ ] **Step 2: Write the failing test**

Create `backend/services/weather/__tests__/windguruScraper.test.js`:
```js
/* eslint-env jest */
/* global describe, it, expect */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseAllModels } from '../windguruScraper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '..', '__fixtures__', 'windguru-574666.html'), 'utf8');

const spanDays = (hours) => {
  const ts = hours.map((h) => Date.parse(h.dateLocal));
  return (Math.max(...ts) - Math.min(...ts)) / 86400000;
};

describe('parseAllModels', () => {
  const parsed = parseAllModels(html);
  const byKey = Object.fromEntries(parsed.models.map((m) => [m.key, m]));

  it('parses the location header', () => {
    expect(parsed.location).toMatch(/Gulbahce/);
    expect(parsed.tzOffsetHours).toBe(3);
  });

  it('parses every wind model and excludes wave models', () => {
    const keys = parsed.models.map((m) => m.key);
    expect(keys).toEqual(expect.arrayContaining(['gfs13', 'ifs9', 'wrf3', 'wrf9', 'icon7', 'icon13']));
    // wave blocks (GFS-Wave / IFS-WAM / GDWPS) have no WSPD column → never parsed
    expect(keys.some((k) => k.includes('wave') || k.includes('wam') || k.includes('gdwps'))).toBe(false);
  });

  it('reads WSPD/GUST as numbers for every model', () => {
    for (const m of parsed.models) {
      expect(m.hours.length).toBeGreaterThan(0);
      for (const h of m.hours) {
        expect(h.wspdKn === null || typeof h.wspdKn === 'number').toBe(true);
        expect(h.hour).toBeGreaterThanOrEqual(0);
        expect(h.hour).toBeLessThanOrEqual(23);
      }
    }
  });

  it('does NOT emit phantom far-future dates (per-block date cursor)', () => {
    // The old parser bled later model tables into future months. WRF 3 only reaches ~2d.
    expect(spanDays(byKey.wrf3.hours)).toBeLessThanOrEqual(3);
    expect(spanDays(byKey.gfs13.hours)).toBeLessThanOrEqual(20);
  });

  it('maps variable columns: WRF 3 has no APCP(3h), GFS has it', () => {
    expect(byKey.wrf3.hours.every((h) => h.precip3hMm === null)).toBe(true);
    expect(byKey.wrf3.hours.some((h) => h.precip1hMm !== null)).toBe(true);
    expect(byKey.gfs13.hours.some((h) => h.precip3hMm !== null || h.precip3hMm === 0)).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run (from repo root): `npm --prefix backend test -- windguruScraper`
Expected: FAIL — `parseAllModels is not a function` (old file only exports `fetchWindguruForecast`).

- [ ] **Step 4: Rewrite the scraper**

Replace the entire contents of `backend/services/weather/windguruScraper.js`:
```js
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm --prefix backend test -- windguruScraper`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/services/weather/windguruScraper.js backend/services/weather/__tests__/windguruScraper.test.js backend/services/weather/__fixtures__/windguru-574666.html
git commit -m "$(printf 'feat(weather): parse all Windguru models, not just GFS\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```

---

## Task 2: UKC Mix blender + cardinal helper

**Files:**
- Create: `backend/services/weather/cardinal.js`
- Create: `backend/services/weather/mix.js`
- Test: `backend/services/weather/__tests__/mix.test.js`

**Interfaces:**
- Consumes: `Model[]` from Task 1.
- Produces: `degToCardinal(deg) → string` (cardinal.js).
- Produces: `median(nums) → number|null`, `circularMeanDeg(degs) → number|null`, `MIX_MODELS = ['wrf3','wrf9','icon7','ifs9']`, `buildMix(models) → { hours: Hour[], contributors: string[] }` (mix.js). Each mix hour is the standard shape plus `sources: string[]`.

- [ ] **Step 1: Write the failing test**

Create `backend/services/weather/__tests__/mix.test.js`:
```js
/* eslint-env jest */
/* global describe, it, expect */
import { median, circularMeanDeg, buildMix, MIX_MODELS } from '../mix.js';

describe('median', () => {
  it('odd length', () => expect(median([3, 1, 2])).toBe(2));
  it('even length averages the middle two', () => expect(median([4, 1, 2, 3])).toBe(2.5));
  it('drops nulls', () => expect(median([5, null, 7])).toBe(6));
  it('empty → null', () => expect(median([null, undefined])).toBeNull());
});

describe('circularMeanDeg', () => {
  it('wraps across 0 (350 & 10 → ~0)', () => {
    const v = circularMeanDeg([350, 10]);
    expect(Math.min(v, 360 - v)).toBeLessThan(0.5);
  });
  it('constant', () => expect(Math.round(circularMeanDeg([90, 90, 90]))).toBe(90));
});

describe('buildMix', () => {
  const hour = (over) => ({
    dateLocal: '2026-07-09', timeLocal: '10:00', dayName: 'Thu', day: 9, hour: 10,
    wspdKn: null, gustKn: null, dirText: null, dirDeg: null, tempC: null,
    pressureHpa: null, cloudHighPct: null, cloudMidPct: null, cloudLowPct: null,
    precip3hMm: null, precip1hMm: null, humidityPct: null, ...over,
  });
  const models = [
    { key: 'wrf3', hours: [hour({ wspdKn: 10, gustKn: 14, dirDeg: 350, tempC: 25, cloudHighPct: 10, precip1hMm: 0 })] },
    { key: 'icon7', hours: [hour({ wspdKn: 14, gustKn: 18, dirDeg: 10, tempC: 27, cloudHighPct: 0, precip1hMm: 0 })] },
    { key: 'gfs13', hours: [hour({ wspdKn: 99, gustKn: 99, dirDeg: 180 })] }, // must be ignored
  ];

  it('medians only the MIX_MODELS and tags sources', () => {
    const { hours, contributors } = buildMix(models);
    expect(hours).toHaveLength(1);
    expect(hours[0].wspdKn).toBe(12);           // median(10,14)
    expect(hours[0].gustKn).toBe(16);           // median(14,18)
    expect(Math.min(hours[0].dirDeg, 360 - hours[0].dirDeg)).toBeLessThan(1); // ~0
    expect(hours[0].sources.sort()).toEqual(['icon7', 'wrf3']);
    expect(contributors.sort()).toEqual(['icon7', 'wrf3']);
    expect(MIX_MODELS).not.toContain('gfs13');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix backend test -- mix`
Expected: FAIL — `Cannot find module '../mix.js'`.

- [ ] **Step 3: Create cardinal.js**

Create `backend/services/weather/cardinal.js`:
```js
// Degrees → 16-point cardinal. Shared by the mix blender and the weather routes.
const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export const degToCardinal = (deg) => {
  if (deg == null || Number.isNaN(deg)) return null;
  return DIRS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
};
```

- [ ] **Step 4: Create mix.js**

Create `backend/services/weather/mix.js`:
```js
import { degToCardinal } from './cardinal.js';

// UKC Mix = per-hour blend of the local/short-range models the owner trusts (GFS is
// deliberately excluded — it reads wrong for the Gülbahçe lagoon). Wind/gust/temp/
// cloud/rain are medians (robust to one model drifting); direction is a vector mean.
export const MIX_MODELS = ['wrf3', 'wrf9', 'icon7', 'ifs9'];

export const median = (nums) => {
  const a = nums.filter((n) => n != null).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
};

export const circularMeanDeg = (degs) => {
  const ds = degs.filter((d) => d != null);
  if (!ds.length) return null;
  let s = 0, c = 0;
  for (const d of ds) { const r = (d * Math.PI) / 180; s += Math.sin(r); c += Math.cos(r); }
  return ((Math.atan2(s, c) * 180) / Math.PI + 360) % 360;
};

const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);
const cloudMax = (h) => {
  const v = [h.cloudHighPct, h.cloudMidPct, h.cloudLowPct].filter((x) => x != null);
  return v.length ? Math.max(...v) : null;
};
const rain = (h) => (h.precip1hMm != null ? h.precip1hMm : (h.precip3hMm != null ? h.precip3hMm / 3 : null));

/**
 * @param {Array<{key:string, hours:Array}>} models
 * @returns {{hours:Array, contributors:string[]}}
 */
export const buildMix = (models) => {
  const byKey = Object.fromEntries(models.map((m) => [m.key, m]));
  const present = MIX_MODELS.filter((k) => byKey[k]);
  const slots = new Map(); // `${dateLocal} ${hour}` → { base, samples[] }

  for (const key of present) {
    for (const h of byKey[key].hours) {
      const id = `${h.dateLocal} ${h.hour}`;
      if (!slots.has(id)) slots.set(id, { base: h, samples: [] });
      slots.get(id).samples.push({ key, h });
    }
  }

  const hours = [];
  for (const { base, samples } of slots.values()) {
    const dirDeg = circularMeanDeg(samples.map((s) => s.h.dirDeg));
    hours.push({
      dateLocal: base.dateLocal, timeLocal: base.timeLocal, dayName: base.dayName, day: base.day, hour: base.hour,
      wspdKn: round1(median(samples.map((s) => s.h.wspdKn))),
      gustKn: round1(median(samples.map((s) => s.h.gustKn))),
      dirDeg: dirDeg == null ? null : Math.round(dirDeg),
      dirText: degToCardinal(dirDeg),
      tempC: round1(median(samples.map((s) => s.h.tempC))),
      pressureHpa: round1(median(samples.map((s) => s.h.pressureHpa))),
      cloudHighPct: round1(median(samples.map((s) => cloudMax(s.h)))),
      cloudMidPct: null,
      cloudLowPct: null,
      precip3hMm: null,
      precip1hMm: round1(median(samples.map((s) => rain(s.h)))),
      humidityPct: round1(median(samples.map((s) => s.h.humidityPct))),
      sources: MIX_MODELS.filter((k) => samples.some((s) => s.key === k)),
    });
  }

  hours.sort((a, b) => (a.dateLocal < b.dateLocal ? -1 : a.dateLocal > b.dateLocal ? 1 : a.hour - b.hour));
  return { hours, contributors: present };
};
```
Note: `cloudHighPct` carries the blended cloud cover (mid/low left null); `cloudDisplay` on the frontend already maxes the three, so a single populated field is fine and `dailySummary`'s cloud average still works.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm --prefix backend test -- mix`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/services/weather/cardinal.js backend/services/weather/mix.js backend/services/weather/__tests__/mix.test.js
git commit -m "$(printf 'feat(weather): UKC Mix median blender + shared cardinal helper\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```

---

## Task 3: Weather service + API (mix default, per-model tabs)

**Files:**
- Modify: `backend/services/weather/index.js`
- Modify: `backend/services/weather/spots.js` (add `station` to gulbahce)
- Modify: `backend/routes/weather.js`
- Test: `backend/services/weather/__tests__/index.test.js` (create)

**Interfaces:**
- Consumes: `fetchWindguruModels` (T1), `buildMix`/`MIX_MODELS` (T2).
- Produces: `MODEL_ORDER = ['mix','wrf3','wrf9','icon7','ifs9','icon13','gfs13']` (from `modelOrder.js`, re-exported by index).
- Produces (pure, exported for testing): `buildForecast(bundle, {model}) → forecast`.
- Produces: `getSpotReport(spotId,{lang,model}) → { spot, forecast }` where `forecast = { location, lat, lon, altM, sstC, tzOffsetHours, fetchedAt, model:{key,name,resolution,initUtcIso}, models:[{key,name,resolution,initUtcIso,horizonHours}], hours }`. `model` defaults to `'mix'`; unknown model → `throw new Error('Unknown model: <k>')`.
- Produces: `getAllSpotReports({lang}) → Report[]` (mix default, same envelope as today).

- [ ] **Step 1: Write the failing test**

`buildForecast` is a pure function (no network, no db), so the test needs no mocking. Create `backend/services/weather/__tests__/index.test.js`:
```js
/* eslint-env jest */
/* global describe, it, expect */
import { buildForecast, MODEL_ORDER } from '../index.js';

const h = (wspd) => ({
  dateLocal: '2026-07-09', timeLocal: '10:00', dayName: 'Thu', day: 9, hour: 10,
  wspdKn: wspd, gustKn: wspd + 4, dirText: 'N', dirDeg: 0, tempC: 25,
  pressureHpa: 1010, cloudHighPct: 0, cloudMidPct: 0, cloudLowPct: 0,
  precip3hMm: null, precip1hMm: 0, humidityPct: 50,
});

const bundle = {
  location: 'Urla, Gulbahce', lat: 38.3, lon: 26.6, altM: 1, sstC: 25, tzOffsetHours: 3, fetchedAt: 'x',
  models: [
    { key: 'wrf3', name: 'WRF', resolution: '3 km', initUtcIso: '2026-07-08T18:00:00Z', hours: [h(10)] },
    { key: 'icon7', name: 'ICON', resolution: '7 km', initUtcIso: '2026-07-09T00:00:00Z', hours: [h(14)] },
    { key: 'gfs13', name: 'GFS', resolution: '13 km', initUtcIso: '2026-07-09T00:00:00Z', hours: [h(99)] },
  ],
};

describe('buildForecast', () => {
  it('defaults to the UKC Mix', () => {
    const f = buildForecast(bundle, {});
    expect(f.model.key).toBe('mix');
    expect(f.hours[0].wspdKn).toBe(12); // median(10,14), gfs ignored
    expect(f.models.map((m) => m.key)).toEqual(
      MODEL_ORDER.filter((k) => k === 'mix' || ['wrf3', 'icon7', 'gfs13'].includes(k))
    );
  });

  it('returns a raw model when asked', () => {
    const f = buildForecast(bundle, { model: 'gfs13' });
    expect(f.model.key).toBe('gfs13');
    expect(f.hours[0].wspdKn).toBe(99);
  });

  it('throws on an unknown model', () => {
    expect(() => buildForecast(bundle, { model: 'nope' })).toThrow(/Unknown model/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix backend test -- weather/__tests__/index`
Expected: FAIL — `buildForecast is not a function` (not yet exported).

- [ ] **Step 3: Add the station field to gulbahce**

In `backend/services/weather/spots.js`, add one line inside the `gulbahce` object (after `water: 'flat',`):
```js
    station: 'IURLA24', // WU PWS at the beach — the only spot with a truth station (accuracy scoring)
```

- [ ] **Step 4: Create modelOrder.js**

`MODEL_ORDER` lives in its own module so both `index.js` and `accuracy.js` can import it without a circular dependency. Create `backend/services/weather/modelOrder.js`:
```js
// Tab order on the wind-report page. 'mix' is the default; GFS is kept last as a muted
// "reference" tab. Shared by index.js (forecast assembly) and accuracy.js (scoring).
export const MODEL_ORDER = ['mix', 'wrf3', 'wrf9', 'icon7', 'ifs9', 'icon13', 'gfs13'];
```

- [ ] **Step 5: Rewrite index.js**

Replace the whole body of `backend/services/weather/index.js`:
```js
import { SPOTS, SPOT_LIST, getSpot } from './spots.js';
import { fetchWindguruModels } from './windguruScraper.js';
import { buildMix } from './mix.js';
import { MODEL_ORDER } from './modelOrder.js';

export { SPOTS, SPOT_LIST, getSpot };
export { MODEL_ORDER };
export { getUkcLive } from './ukcStation.js';
export { getPwsLive } from './wundergroundStation.js';
export { recordPwsReading, getPwsHistory, HISTORY_RANGES } from './history.js';
export { getModelAccuracy } from './accuracy.js';
export const listSpots = () => SPOT_LIST;

const horizonHours = (hours) => {
  if (!hours.length) return 0;
  const ts = hours.map((x) => Date.parse(`${x.dateLocal}T${x.timeLocal}:00`));
  return Math.round((Math.max(...ts) - Math.min(...ts)) / 3600000);
};

// Latest init among the mix contributors (mix has no single init of its own).
const maxInit = (models, contributors) =>
  contributors
    .map((k) => models.find((m) => m.key === k)?.initUtcIso)
    .filter(Boolean)
    .sort()
    .pop() || null;

export const buildForecast = (bundle, opts = {}) => {
  const modelKey = opts.model || 'mix';
  const mix = buildMix(bundle.models);

  // Tab metadata: mix first (if it has contributors), then each raw model in MODEL_ORDER.
  const tabs = [];
  if (mix.contributors.length) {
    tabs.push({ key: 'mix', name: 'UKC Mix', resolution: '', initUtcIso: maxInit(bundle.models, mix.contributors), horizonHours: horizonHours(mix.hours) });
  }
  for (const key of MODEL_ORDER) {
    if (key === 'mix') continue;
    const m = bundle.models.find((x) => x.key === key);
    if (m) tabs.push({ key: m.key, name: m.name, resolution: m.resolution, initUtcIso: m.initUtcIso, horizonHours: horizonHours(m.hours) });
  }

  let selected;
  if (modelKey === 'mix') {
    selected = { hours: mix.hours, meta: { key: 'mix', name: 'UKC Mix', resolution: '', initUtcIso: maxInit(bundle.models, mix.contributors) } };
  } else {
    const m = bundle.models.find((x) => x.key === modelKey);
    if (!m) throw new Error(`Unknown model: ${modelKey}`);
    selected = { hours: m.hours, meta: { key: m.key, name: m.name, resolution: m.resolution, initUtcIso: m.initUtcIso } };
  }

  return {
    location: bundle.location, lat: bundle.lat, lon: bundle.lon, altM: bundle.altM, sstC: bundle.sstC,
    tzOffsetHours: bundle.tzOffsetHours, fetchedAt: bundle.fetchedAt,
    model: selected.meta,
    models: tabs,
    hours: selected.hours,
  };
};

export const getSpotReport = async (spotId, opts = {}) => {
  const spot = getSpot(spotId);
  if (!spot) throw new Error(`Unknown spot: ${spotId}`);
  if (!spot.windguruSpotId) throw new Error(`Spot ${spotId} has no windguruSpotId configured`);
  const bundle = await fetchWindguruModels({ spotId: spot.windguruSpotId, lang: opts.lang || 'en' });
  return { spot, forecast: buildForecast(bundle, { model: opts.model }) };
};

export const getAllSpotReports = async (opts = {}) => {
  return Promise.all(
    SPOT_LIST.map((spot) => getSpotReport(spot.id, { lang: opts.lang }).catch((err) => ({ spot, error: err.message })))
  );
};
```
Note: this imports `./accuracy.js` (Task 6). Create a stub now so the module loads:

- [ ] **Step 6: Create an accuracy stub (filled in Task 6)**

Create `backend/services/weather/accuracy.js`:
```js
// Real implementation lands in Task 6. Stub keeps index.js importable meanwhile.
export const getModelAccuracy = async () => ({ models: [] });
export const computeMae = () => null;
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm --prefix backend test -- weather/__tests__/index`
Expected: PASS (3 tests).

- [ ] **Step 8: Update the routes**

In `backend/routes/weather.js`:

(a) Replace the local `degToCardinal` (lines 7–13) with an import — add at the top with the other imports:
```js
import { degToCardinal } from '../services/weather/cardinal.js';
```
and delete the local `const degToCardinal = …};` block. In the `/hourly` handler, `degToCardinal(dirDeg)` may now return `null` for missing data — replace `dirText: degToCardinal(dirDeg),` with `dirText: degToCardinal(dirDeg) || 'N',` to preserve today's behaviour.

(b) Add `getModelAccuracy` to the service import line:
```js
import { listSpots, getSpotReport, getAllSpotReports, getUkcLive, getPwsLive, getPwsHistory, getModelAccuracy } from '../services/weather/index.js';
```

(c) Replace the `/report/:spotId` handler with (adds `model` + 400 on unknown):
```js
router.get('/report/:spotId', async (req, res) => {
  try {
    const report = await getSpotReport(req.params.spotId, { lang: req.query.lang, model: req.query.model });
    res.json(report);
  } catch (err) {
    const msg = err?.message || 'Failed to fetch forecast';
    if (msg.startsWith('Unknown spot')) return res.status(404).json({ error: msg });
    if (msg.startsWith('Unknown model')) return res.status(400).json({ error: msg });
    res.status(502).json({ error: msg });
  }
});
```

(d) After the `/report` (all) handler, add the accuracy endpoint:
```js
// GET /api/weather/models/accuracy?spotId=gulbahce — per-model MAE vs the beach station.
router.get('/models/accuracy', async (req, res) => {
  try {
    const data = await getModelAccuracy(req.query.spotId);
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err?.message || 'Failed to fetch model accuracy' });
  }
});
```

- [ ] **Step 9: Verify routes load + serve live data**

Run (from repo root, with local backend up via `npm run dev:backend`):
```bash
curl -s "http://localhost:4000/api/weather/report/gulbahce" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('model=',j.forecast.model.key,'tabs=',j.forecast.models.map(m=>m.key).join(','),'hours=',j.forecast.hours.length)})"
curl -s "http://localhost:4000/api/weather/report/gulbahce?model=wrf3" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('model=',j.forecast.model.key)})"
```
Expected: first prints `model= mix tabs= mix,wrf3,wrf9,icon7,ifs9,icon13,gfs13 hours= <n>`; second prints `model= wrf3`.

- [ ] **Step 10: Commit**

```bash
git add backend/services/weather/index.js backend/services/weather/modelOrder.js backend/services/weather/spots.js backend/services/weather/accuracy.js backend/routes/weather.js backend/services/weather/__tests__/index.test.js
git commit -m "$(printf 'feat(weather): serve UKC Mix by default with per-model tabs API\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```

---

## Task 4: forecast_snapshots migration

**Files:**
- Create: `backend/db/migrations/287_create_forecast_snapshots.sql`

- [ ] **Step 1: Write the migration**

Create `backend/db/migrations/287_create_forecast_snapshots.sql`:
```sql
-- Migration 287: per-model forecast snapshots for accuracy scoring.
-- Every 6h a cron (backend/jobs/forecastSnapshotJob.js) records what each model (and the
-- UKC Mix) predicted for the next ~48h. Later we pair each prediction with the actual
-- reading from wind_history (the beach PWS) to compute a per-model mean absolute error,
-- which surfaces as the ±kn badge on the model tabs. Append-only; never deleted.
--
-- Idempotency: keyed on (spot_id, model_key, target_ts, init_utc). Re-running the same
-- model init for the same target hour is a no-op via ON CONFLICT DO NOTHING.

CREATE TABLE IF NOT EXISTS forecast_snapshots (
  id           BIGSERIAL PRIMARY KEY,
  spot_id      TEXT NOT NULL,                 -- e.g. "gulbahce"
  model_key    TEXT NOT NULL,                 -- 'mix' | 'wrf3' | 'wrf9' | 'icon7' | 'ifs9' | 'icon13' | 'gfs13'
  target_ts    TIMESTAMPTZ NOT NULL,          -- forecast valid time (the local hour, as UTC)
  lead_hours   SMALLINT NOT NULL,             -- hours between capture and target
  wspd_kn      NUMERIC(5,1),
  gust_kn      NUMERIC(5,1),
  dir_deg      SMALLINT,
  init_utc     TIMESTAMPTZ NOT NULL,          -- model run init (mix: latest contributor init)
  captured_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (spot_id, model_key, target_ts, init_utc)
);

CREATE INDEX IF NOT EXISTS forecast_snapshots_spot_model_target
  ON forecast_snapshots (spot_id, model_key, target_ts DESC);

COMMENT ON TABLE forecast_snapshots IS
  'Append-only per-model forecast predictions. Paired with wind_history to score model '
  'accuracy (MAE) for the wind-report model tabs.';
```

- [ ] **Step 2: Run the migration**

Run (from repo root): `npm run migrate:up`
Expected: applies migration 287 without error.

- [ ] **Step 3: Verify the table exists**

Run: `docker exec -i $(docker ps -qf name=postgres) psql -U postgres -d plannivo_dev -c "\d forecast_snapshots" 2>/dev/null || echo "check container name"`
Expected: prints the table columns (id, spot_id, model_key, …). If the container name differs, use the name from `docker ps`.

- [ ] **Step 4: Commit**

```bash
git add backend/db/migrations/287_create_forecast_snapshots.sql
git commit -m "$(printf 'feat(weather): forecast_snapshots table (migration 287)\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```

---

## Task 5: Snapshot recorder cron

**Files:**
- Create: `backend/jobs/forecastSnapshotJob.js`
- Modify: `backend/server.js`

**Interfaces:**
- Consumes: `fetchWindguruModels` (T1), `buildMix`/`MIX_MODELS` (T2), `SPOT_LIST` (spots).
- Produces: `runForecastSnapshotTick() → { inserted }`, `startForecastSnapshotJob()`, `stopForecastSnapshotJob()`.

- [ ] **Step 1: Write the job**

Create `backend/jobs/forecastSnapshotJob.js`:
```js
import cron from 'node-cron';
import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { SPOT_LIST } from '../services/weather/spots.js';
import { fetchWindguruModels } from '../services/weather/windguruScraper.js';
import { buildMix } from '../services/weather/mix.js';
import { MODEL_ORDER } from '../services/weather/modelOrder.js';

// Record what every model (and the Mix) predicts for the next 48h, so we can later
// score each model against what the beach station actually measured. Idempotent per
// model init, so overlapping ticks never duplicate. Snapshots only accrue while the
// backend runs (i.e. in production) — like the wind-history recorder.
const SCHEDULE_EXPRESSION = process.env.FORECAST_SNAPSHOT_CRON || '0 */6 * * *';
const DISPLAY_START = 6;
const DISPLAY_END = 22;
const MAX_LEAD_H = 48;

const toUtc = (dateLocal, hour, tzOffset) => {
  const sign = tzOffset >= 0 ? '+' : '-';
  const off = String(Math.abs(tzOffset)).padStart(2, '0');
  return new Date(`${dateLocal}T${String(hour).padStart(2, '0')}:00:00${sign}${off}:00`);
};

const maxInit = (models, keys) =>
  keys.map((k) => models.find((m) => m.key === k)?.initUtcIso).filter(Boolean).sort().pop();

export const runForecastSnapshotTick = async () => {
  const now = Date.now();
  let inserted = 0;

  for (const spot of SPOT_LIST) {
    let bundle;
    try {
      bundle = await fetchWindguruModels({ spotId: spot.windguruSpotId, lang: 'en' });
    } catch (err) {
      logger.warn('forecast_snapshots: fetch failed, skipping spot', { spot: spot.id, error: err.message });
      continue;
    }

    const mix = buildMix(bundle.models);
    const series = [];
    if (mix.contributors.length) series.push({ key: 'mix', hours: mix.hours, init: maxInit(bundle.models, mix.contributors) });
    for (const key of MODEL_ORDER) {
      if (key === 'mix') continue;
      const m = bundle.models.find((x) => x.key === key);
      if (m) series.push({ key: m.key, hours: m.hours, init: m.initUtcIso });
    }

    for (const s of series) {
      for (const h of s.hours) {
        if (h.hour < DISPLAY_START || h.hour > DISPLAY_END) continue;
        const target = toUtc(h.dateLocal, h.hour, bundle.tzOffsetHours);
        const lead = (target.getTime() - now) / 3600000;
        if (lead < 0 || lead > MAX_LEAD_H) continue;
        try {
          const { rowCount } = await pool.query(
            `INSERT INTO forecast_snapshots
               (spot_id, model_key, target_ts, lead_hours, wspd_kn, gust_kn, dir_deg, init_utc)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (spot_id, model_key, target_ts, init_utc) DO NOTHING`,
            [spot.id, s.key, target.toISOString(), Math.round(lead), h.wspdKn, h.gustKn, h.dirDeg, s.init]
          );
          inserted += rowCount;
        } catch (err) {
          logger.error('forecast_snapshots: insert failed', { spot: spot.id, model: s.key, error: err.message });
        }
      }
    }
  }

  logger.info('Forecast snapshot tick complete', { inserted });
  return { inserted };
};

let scheduledTask = null;

export function startForecastSnapshotJob() {
  if (scheduledTask) { logger.warn('Forecast snapshot job already running'); return scheduledTask; }
  scheduledTask = cron.schedule(SCHEDULE_EXPRESSION, () => {
    runForecastSnapshotTick().catch((error) => logger.error('Forecast snapshot: unhandled tick error', { error: error.message }));
  });
  logger.info('Forecast snapshot cron scheduled', { expression: SCHEDULE_EXPRESSION });
  return scheduledTask;
}

export function stopForecastSnapshotJob() {
  if (scheduledTask) { scheduledTask.stop(); scheduledTask = null; logger.info('Forecast snapshot cron stopped'); }
}

export default { startForecastSnapshotJob, stopForecastSnapshotJob, runForecastSnapshotTick };
```

- [ ] **Step 2: Wire it into server.js**

In `backend/server.js`, add the import next to the wind-history job import (after line 107):
```js
import { startForecastSnapshotJob } from './jobs/forecastSnapshotJob.js';
```
And after the wind-history recorder start block (after line 1748, the closing `}` of that try/catch), add:
```js
    // Start forecast snapshot recorder cron (every 6h) — feeds per-model accuracy scoring
    try {
      startForecastSnapshotJob();
      logger.info('✅ Forecast snapshot cron started');
    } catch (error) {
      logger.error('❌ Failed to start forecast snapshot cron:', error);
    }
```

- [ ] **Step 3: Verify one tick inserts rows (local)**

Run (from `backend/`, local backend NOT required — this runs the tick directly):
```bash
node --input-type=module -e "import('./jobs/forecastSnapshotJob.js').then(async m => { const r = await m.runForecastSnapshotTick(); console.log('inserted', r.inserted); process.exit(0); })"
```
Expected: prints `inserted <n>` with n > 0 (hits live Windguru + local DB). Re-running prints `inserted 0` (idempotent). If Windguru is unreachable it logs a warn and inserts 0 — acceptable.

- [ ] **Step 4: Commit**

```bash
git add backend/jobs/forecastSnapshotJob.js backend/server.js
git commit -m "$(printf 'feat(weather): forecast snapshot recorder cron\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```

---

## Task 6: Accuracy scoring + endpoint

**Files:**
- Modify: `backend/services/weather/accuracy.js` (replace the Task 3 stub)
- Test: `backend/services/weather/__tests__/accuracy.test.js`

**Interfaces:**
- Consumes: `getSpot` (spots), `MODEL_ORDER` (index), `pool` (db), `wind_history` + `forecast_snapshots` tables.
- Produces: `computeMae(pairs) → number|null` (pure; `pairs = [{pred, actual}]`, null when < 20 valid pairs), `getModelAccuracy(spotId,{windowDays}) → { spotId, windowDays, computedAt, models:[{key, maeKn, pairs}] }`.

- [ ] **Step 1: Write the failing test (pure MAE helper)**

Create `backend/services/weather/__tests__/accuracy.test.js`:
```js
/* eslint-env jest */
/* global describe, it, expect */
import { computeMae } from '../accuracy.js';

const pairs = (errs) => errs.map((e) => ({ pred: 10 + e, actual: 10 }));

describe('computeMae', () => {
  it('null below the 20-pair floor', () => {
    expect(computeMae(pairs([1, -1, 2]))).toBeNull();
  });
  it('mean absolute error over enough pairs', () => {
    const errs = Array.from({ length: 20 }, (_, i) => (i % 2 ? 2 : -2)); // |err| always 2
    expect(computeMae(pairs(errs))).toBe(2);
  });
  it('ignores pairs with a null actual', () => {
    const good = pairs(Array.from({ length: 20 }, () => 3)); // |err| 3
    good.push({ pred: 10, actual: null });
    expect(computeMae(good)).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix backend test -- accuracy`
Expected: FAIL — `computeMae` returns the stub `null` unconditionally / no 20-pair logic.

- [ ] **Step 3: Implement accuracy.js**

Replace `backend/services/weather/accuracy.js`:
```js
import { pool } from '../../db.js';
import { getSpot } from './spots.js';
import { MODEL_ORDER } from './modelOrder.js';

const MIN_PAIRS = 20;

/**
 * Mean absolute error over prediction/actual pairs, in knots. Null until we have at
 * least MIN_PAIRS matched observations (small samples are noise, not signal).
 * @param {Array<{pred:number, actual:number|null}>} pairs
 */
export const computeMae = (pairs) => {
  const valid = pairs.filter((p) => p.actual != null && p.pred != null);
  if (valid.length < MIN_PAIRS) return null;
  const sum = valid.reduce((a, p) => a + Math.abs(p.pred - p.actual), 0);
  return Math.round((sum / valid.length) * 10) / 10;
};

/**
 * Per-model accuracy for a spot: for each (model, target hour) take the snapshot with
 * the smallest usable lead (6–30h → "day-before" forecast), pair it with the nearest
 * station reading within ±30 min over the last `windowDays`, and reduce to MAE.
 * Spots without a station return an empty list.
 */
export const getModelAccuracy = async (spotId, { windowDays = 14 } = {}) => {
  const spot = getSpot(spotId);
  const base = { spotId, windowDays, computedAt: new Date().toISOString(), models: [] };
  if (!spot || !spot.station) return base;

  const { rows } = await pool.query(
    `WITH best AS (
       SELECT DISTINCT ON (model_key, target_ts)
              model_key, target_ts, wspd_kn
         FROM forecast_snapshots
        WHERE spot_id = $1
          AND target_ts >= now() - ($2 || ' days')::interval
          AND target_ts <= now()
          AND lead_hours BETWEEN 6 AND 30
        ORDER BY model_key, target_ts, lead_hours ASC
     ),
     paired AS (
       SELECT b.model_key,
              b.wspd_kn AS pred,
              (SELECT wh.wind_avg_kts
                 FROM wind_history wh
                WHERE wh.station_id = $3
                  AND wh.observed_at BETWEEN b.target_ts - interval '30 min'
                                         AND b.target_ts + interval '30 min'
                ORDER BY abs(extract(epoch FROM (wh.observed_at - b.target_ts))) ASC
                LIMIT 1) AS actual
         FROM best b
     )
     SELECT model_key,
            count(*) FILTER (WHERE actual IS NOT NULL AND pred IS NOT NULL) AS pairs,
            round(avg(abs(pred - actual)) FILTER (WHERE actual IS NOT NULL AND pred IS NOT NULL), 1) AS mae
       FROM paired
      GROUP BY model_key`,
    [spotId, String(windowDays), spot.station]
  );

  const byKey = Object.fromEntries(rows.map((r) => [r.model_key, r]));
  base.models = MODEL_ORDER
    .filter((k) => byKey[k])
    .map((k) => {
      const r = byKey[k];
      const pairs = Number(r.pairs);
      return { key: k, pairs, maeKn: pairs >= MIN_PAIRS && r.mae != null ? Number(r.mae) : null };
    });
  return base;
};
```
Note: `MIN_PAIRS` gates both the pure helper and the SQL result mapping, so the badge only shows once the sample is real (~7 days of 6h captures × daylight hours easily clears 20).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix backend test -- accuracy`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify the endpoint responds (local, read-only)**

Run (local backend up):
```bash
curl -s "http://localhost:4000/api/weather/models/accuracy?spotId=gulbahce"
curl -s "http://localhost:4000/api/weather/models/accuracy?spotId=alacati"
```
Expected: gulbahce returns `{"spotId":"gulbahce","windowDays":14,"computedAt":…,"models":[…]}` (models likely `[]` or `maeKn:null` until ~7 days of snapshots+history accrue in prod); alacati returns `models: []` (no station). No 500s.

- [ ] **Step 6: Commit**

```bash
git add backend/services/weather/accuracy.js backend/services/weather/__tests__/accuracy.test.js
git commit -m "$(printf 'feat(weather): per-model accuracy scoring vs beach station\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```

---

## Task 7: Frontend grid utils (pure)

**Files:**
- Create: `src/features/wind-report/utils/models.js`
- Create: `src/features/wind-report/utils/forecastGrid.js`
- Test: `tests/unit/frontend/windReport/forecastGrid.test.js`

**Interfaces:**
- Produces (models.js): `MIX_KEY = 'mix'`, `MODEL_ORDER` (matches backend), `MODEL_LABEL` (`{mix:'UKC Mix', wrf3:'WRF 3', …}`), `GHOST_MODELS = ['gfs13']`.
- Produces (forecastGrid.js): `DISPLAY_START=6`, `DISPLAY_END=22`, `starRating(kn)→0..3`, `cloudPct(h)→number|null`, `rainMm(h)→number|null`, `dayColumns(rows)→Hour[]`, `daySourceLabel(rows, modelName)→string`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/frontend/windReport/forecastGrid.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { starRating, cloudPct, rainMm, dayColumns, daySourceLabel } from '@/features/wind-report/utils/forecastGrid';

describe('starRating', () => {
  it('bands by knots', () => {
    expect(starRating(null)).toBe(0);
    expect(starRating(5)).toBe(0);
    expect(starRating(10)).toBe(1);
    expect(starRating(14)).toBe(2);
    expect(starRating(22)).toBe(3);
  });
});

describe('cloudPct / rainMm', () => {
  it('cloud = max of the three layers', () => {
    expect(cloudPct({ cloudHighPct: 10, cloudMidPct: 40, cloudLowPct: 0 })).toBe(40);
    expect(cloudPct({ cloudHighPct: null, cloudMidPct: null, cloudLowPct: null })).toBeNull();
  });
  it('rain prefers 1h, falls back to 3h/3', () => {
    expect(rainMm({ precip1hMm: 2, precip3hMm: 9 })).toBe(2);
    expect(rainMm({ precip1hMm: null, precip3hMm: 9 })).toBe(3);
    expect(rainMm({ precip1hMm: null, precip3hMm: null })).toBeNull();
  });
});

describe('dayColumns', () => {
  it('keeps 06–22 ascending, drops night hours', () => {
    const rows = [{ hour: 23 }, { hour: 6 }, { hour: 14 }, { hour: 3 }];
    expect(dayColumns(rows).map((r) => r.hour)).toEqual([6, 14]);
  });
});

describe('daySourceLabel', () => {
  it('raw model rows (no sources) → the model name', () => {
    expect(daySourceLabel([{ hour: 10 }], 'WRF 3')).toBe('WRF 3');
  });
  it('mix rows → primary + count of others', () => {
    const rows = [{ sources: ['wrf3', 'icon7', 'ifs9'] }, { sources: ['ifs9'] }];
    expect(daySourceLabel(rows, 'UKC Mix')).toBe('WRF 3 +2');
  });
  it('mix rows with a single source → just that label', () => {
    expect(daySourceLabel([{ sources: ['ifs9'] }], 'UKC Mix')).toBe('IFS 9');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/frontend/windReport/forecastGrid.test.js`
Expected: FAIL — cannot resolve `@/features/wind-report/utils/forecastGrid`.

- [ ] **Step 3: Create models.js**

Create `src/features/wind-report/utils/models.js`:
```js
// Model tab order + labels — mirrors backend MODEL_ORDER (services/weather/index.js).
export const MIX_KEY = 'mix';
export const MODEL_ORDER = ['mix', 'wrf3', 'wrf9', 'icon7', 'ifs9', 'icon13', 'gfs13'];
export const MODEL_LABEL = {
  mix: 'UKC Mix',
  wrf3: 'WRF 3',
  wrf9: 'WRF 9',
  icon7: 'ICON 7',
  ifs9: 'IFS 9',
  icon13: 'ICON 13',
  gfs13: 'GFS 13',
};
// Shown as muted "reference" tabs — GFS is the model the owner does not trust locally.
export const GHOST_MODELS = ['gfs13'];
```

- [ ] **Step 4: Create forecastGrid.js**

Create `src/features/wind-report/utils/forecastGrid.js`:
```js
import { MODEL_LABEL } from './models';

// Display window for the grid columns (school hours + early/late sessions).
export const DISPLAY_START = 6;
export const DISPLAY_END = 22;

// Windguru-style quality stars from wind speed (kn): <8 none, 8–11 ★, 12–15 ★★, ≥16 ★★★.
export const starRating = (kn) => (kn == null || kn < 8 ? 0 : kn < 12 ? 1 : kn < 16 ? 2 : 3);

export const cloudPct = (h) => {
  const v = [h.cloudHighPct, h.cloudMidPct, h.cloudLowPct].filter((x) => x != null);
  return v.length ? Math.max(...v) : null;
};

export const rainMm = (h) =>
  h.precip1hMm != null ? h.precip1hMm : (h.precip3hMm != null ? h.precip3hMm / 3 : null);

// The hours a day renders: inside the display window, ascending. Far models are sparse
// (3–6 hourly) so each day simply renders the hours it actually has.
export const dayColumns = (rows) =>
  (rows || []).filter((r) => r.hour >= DISPLAY_START && r.hour <= DISPLAY_END).sort((a, b) => a.hour - b.hour);

// Day source chip. Raw-model rows carry no `sources` → show the model name. Mix rows
// carry `sources[]` → "<sharpest present> +N" (or just the label when only one).
const SOURCE_ORDER = ['wrf3', 'wrf9', 'icon7', 'ifs9', 'icon13', 'gfs13'];
export const daySourceLabel = (rows, modelName) => {
  const all = new Set();
  (rows || []).forEach((r) => (r.sources || []).forEach((s) => all.add(s)));
  if (!all.size) return modelName;
  const present = SOURCE_ORDER.filter((k) => all.has(k));
  const primary = MODEL_LABEL[present[0]] || present[0];
  return present.length === 1 ? primary : `${primary} +${present.length - 1}`;
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/frontend/windReport/forecastGrid.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/wind-report/utils/models.js src/features/wind-report/utils/forecastGrid.js tests/unit/frontend/windReport/forecastGrid.test.js
git commit -m "$(printf 'feat(wind-report): pure grid + model helpers\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```

---

## Task 8: Frontend service + hooks

**Files:**
- Modify: `src/features/wind-report/services/windReportService.js`
- Create: `src/features/wind-report/hooks/useSpotModelSeries.js`
- Create: `src/features/wind-report/hooks/useModelAccuracy.js`

**Interfaces:**
- Produces: `fetchSpotModelSeries(spotId, model, {lang}) → {spot, forecast}`, `fetchModelAccuracy(spotId) → {spotId, models:[{key,maeKn,pairs}]}`.
- Produces: `useSpotModelSeries(spotId, model, enabled)` (React Query; disabled when `model === 'mix'`), `useModelAccuracy(spotId)`.

- [ ] **Step 1: Add service functions**

Append to `src/features/wind-report/services/windReportService.js`:
```js
/** One raw model's series for a spot (windguru tab equivalent). model = 'wrf3' | … */
export const fetchSpotModelSeries = async (spotId, model, { lang } = {}) => {
  const params = { model };
  if (lang) params.lang = lang;
  const { data } = await apiClient.get(`/weather/report/${spotId}`, { params });
  return data;
};

/** Per-model accuracy (±kn) for a spot. Empty for spots without a station. */
export const fetchModelAccuracy = async (spotId) => {
  const { data } = await apiClient.get('/weather/models/accuracy', { params: { spotId } });
  return data;
};
```

- [ ] **Step 2: Create useSpotModelSeries.js**

Create `src/features/wind-report/hooks/useSpotModelSeries.js`:
```js
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchSpotModelSeries } from '../services/windReportService';

/**
 * A raw model's forecast for one spot, fetched only when a non-Mix tab is active (Mix
 * ships in the initial page payload, so it needs no extra request).
 */
export const useSpotModelSeries = (spotId, model, enabled = true) => {
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2);
  return useQuery({
    queryKey: ['windReport', 'model', spotId, model, lang],
    queryFn: () => fetchSpotModelSeries(spotId, model, { lang }),
    enabled: enabled && !!spotId && !!model && model !== 'mix',
    staleTime: 10 * 60 * 1000,
    keepPreviousData: true,
    refetchOnWindowFocus: false,
    retry: 1,
  });
};
```

- [ ] **Step 3: Create useModelAccuracy.js**

Create `src/features/wind-report/hooks/useModelAccuracy.js`:
```js
import { useQuery } from '@tanstack/react-query';
import { fetchModelAccuracy } from '../services/windReportService';

/** Per-model ±kn badges for a spot (only gulbahce has a station; others return []). */
export const useModelAccuracy = (spotId, enabled = true) =>
  useQuery({
    queryKey: ['windReport', 'accuracy', spotId],
    queryFn: () => fetchModelAccuracy(spotId),
    enabled: enabled && !!spotId,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
```

- [ ] **Step 4: Commit**

```bash
git add src/features/wind-report/services/windReportService.js src/features/wind-report/hooks/useSpotModelSeries.js src/features/wind-report/hooks/useModelAccuracy.js
git commit -m "$(printf 'feat(wind-report): model-series + accuracy data hooks\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```

---

## Task 9: ForecastGrid component

**Files:**
- Create: `src/features/wind-report/components/ForecastGrid.jsx`

**Interfaces:**
- Consumes: `days` (from `groupByDay`), `forecastGrid` utils (T7 — `dayColumns`, `daySourceLabel`, `starRating`, `cloudPct`, `rainMm`), `windBands.getWindBand`, `bandTheme` (`WR_SOFT`/`WR_TEXT`/`WR_HEX`).
- Props: `{ days, modelName, selectedKey, onSelectHour, locale, t }`.
- Produces: the dense heatmap grid (one horizontally-scrolling table, day-grouped columns).

- [ ] **Step 1: Create the component**

Create `src/features/wind-report/components/ForecastGrid.jsx`:
```jsx
import React from 'react';
import { getWindBand } from '../utils/windBands';
import { WR_SOFT, WR_TEXT, WR_HEX } from '../utils/bandTheme';
import { dayColumns, daySourceLabel, starRating, cloudPct, rainMm } from '../utils/forecastGrid';

// Dense Windguru-style forecast: hours (06–22) as columns grouped by day, with wind /
// gusts / direction / temp / clouds+rain / rating rows. Wind + gust cells are coloured
// by wind band but always show the number (colour never stands alone). Horizontally
// scrollable; sticky row labels.

const parseDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };

const Arrow = ({ deg, color = '#475569' }) => (
  <svg width="13" height="13" viewBox="0 0 12 12" className="mx-auto block" aria-hidden="true">
    <g transform={`rotate(${((deg ?? 0) + 180) % 360} 6 6)`}>
      <path d="M6 0.8 L9.4 10.2 L6 8.1 L2.6 10.2 Z" fill={color} />
    </g>
  </svg>
);

const ForecastGrid = ({ days = [], modelName = '', selectedKey, onSelectHour, locale = 'en', t }) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const nowHour = new Date().getHours();

  const dayMeta = (dateLocal) => {
    const date = parseDate(dateLocal);
    const isToday = date.getTime() === today.getTime();
    let badge = null;
    if (isToday) badge = t('windReport.when.today', { defaultValue: 'Today' });
    else if (date.getTime() === tomorrow.getTime()) badge = t('windReport.when.tomorrow', { defaultValue: 'Tomorrow' });
    return { isToday, badge, weekday: date.toLocaleDateString(locale, { weekday: 'short' }), dayNumber: date.getDate() };
  };

  // Flatten to [{ dateLocal, meta, cols }] with only renderable hours.
  const grid = days
    .map((d) => ({ dateLocal: d.dateLocal, meta: dayMeta(d.dateLocal), rows: d.rows, cols: dayColumns(d.rows) }))
    .filter((d) => d.cols.length);

  if (!grid.length) return null;

  const RowLabel = ({ children }) => (
    <th scope="row" className="sticky left-0 z-10 bg-white pr-3 text-left text-[11px] font-gotham-medium text-slate-500 whitespace-nowrap shadow-[6px_0_8px_-6px_rgba(15,23,42,0.14)]">
      {children}
    </th>
  );

  const cellBand = (kn) => {
    const b = getWindBand(kn);
    return b ? `${WR_SOFT[b]} ${WR_TEXT[b]}` : 'bg-slate-50 text-slate-400';
  };

  return (
    <div className="overflow-x-auto pb-1" style={{ scrollSnapType: 'x proximity' }}>
      <table className="border-separate border-spacing-0 tabular-nums">
        <tbody>
          {/* Day + hour header */}
          <tr>
            <RowLabel><span className="sr-only">{t('windReport.metrics.hourly', { defaultValue: 'Hourly forecast' })}</span></RowLabel>
            {grid.map((d) => (
              <th key={`h-${d.dateLocal}`} colSpan={d.cols.length} className="border-l-2 border-slate-200 px-1 pb-1.5 pt-2 text-left align-bottom" style={{ scrollSnapAlign: 'start' }}>
                <span className="font-duotone-bold-extended text-[15px] leading-none text-slate-900">
                  {d.meta.badge ? <span className="text-[#00a8c4]">{d.meta.badge}</span> : d.meta.weekday} {d.meta.dayNumber}
                </span>
                <span className="ml-2 rounded-full border border-cyan-200 bg-cyan-50 px-1.5 py-0.5 text-[9.5px] font-gotham-medium uppercase tracking-wide text-cyan-700 align-middle">
                  {daySourceLabel(d.rows, modelName)}
                </span>
              </th>
            ))}
          </tr>
          <tr>
            <RowLabel />
            {grid.flatMap((d) => d.cols.map((r, i) => {
              const key = `${d.dateLocal}:${r.hour}`;
              const isNow = d.meta.isToday && r.hour === nowHour;
              const selected = key === selectedKey;
              return (
                <th key={`hh-${key}`} className={`${i === 0 ? 'border-l-2 border-slate-200' : ''} px-0 pb-1 pt-0.5`}>
                  <button
                    type="button"
                    onClick={() => onSelectHour?.({ ...r, dateLocal: d.dateLocal })}
                    aria-pressed={selected}
                    className={`min-w-[30px] rounded px-1 text-[11px] font-gotham-medium tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[#00a8c4] ${
                      isNow ? 'text-[#00a8c4]' : selected ? 'text-slate-900' : 'text-slate-500'
                    }`}
                  >
                    {String(r.hour).padStart(2, '0')}
                  </button>
                </th>
              );
            }))}
          </tr>

          {/* Wind */}
          <tr>
            <RowLabel>{t('windReport.metrics.wind', { defaultValue: 'Wind' })}</RowLabel>
            {grid.flatMap((d) => d.cols.map((r, i) => {
              const selected = `${d.dateLocal}:${r.hour}` === selectedKey;
              return (
                <td key={`w-${d.dateLocal}-${r.hour}`} className={`${i === 0 ? 'border-l-2 border-slate-200' : ''} p-[1px]`}>
                  <div className={`flex h-7 min-w-[30px] items-center justify-center rounded-md text-[12.5px] font-gotham-bold ${cellBand(r.wspdKn)} ${selected ? 'ring-2 ring-[#00a8c4] ring-inset' : ''}`}>
                    {r.wspdKn == null ? '–' : Math.round(r.wspdKn)}
                  </div>
                </td>
              );
            }))}
          </tr>

          {/* Gusts */}
          <tr>
            <RowLabel>{t('windReport.metrics.gusts', { defaultValue: 'Gusts' })}</RowLabel>
            {grid.flatMap((d) => d.cols.map((r, i) => (
              <td key={`g-${d.dateLocal}-${r.hour}`} className={`${i === 0 ? 'border-l-2 border-slate-200' : ''} p-[1px]`}>
                <div className={`flex h-7 min-w-[30px] items-center justify-center rounded-md text-[12px] font-gotham-medium opacity-90 ${cellBand(r.gustKn)}`}>
                  {r.gustKn == null ? '–' : Math.round(r.gustKn)}
                </div>
              </td>
            )))}
          </tr>

          {/* Direction */}
          <tr>
            <RowLabel>{t('windReport.metrics.direction', { defaultValue: 'Direction' })}</RowLabel>
            {grid.flatMap((d) => d.cols.map((r, i) => (
              <td key={`d-${d.dateLocal}-${r.hour}`} className={`${i === 0 ? 'border-l-2 border-slate-200' : ''} py-0.5`}>
                <Arrow deg={r.dirDeg} color={WR_HEX[getWindBand(r.wspdKn)] || '#475569'} />
              </td>
            )))}
          </tr>

          {/* Temp */}
          <tr>
            <RowLabel>{t('windReport.metrics.temp', { defaultValue: 'Temp' })}</RowLabel>
            {grid.flatMap((d) => d.cols.map((r, i) => (
              <td key={`t-${d.dateLocal}-${r.hour}`} className={`${i === 0 ? 'border-l-2 border-slate-200' : ''} py-1 text-center text-[11.5px] font-gotham-medium text-slate-600`}>
                {r.tempC == null ? '' : Math.round(r.tempC)}
              </td>
            )))}
          </tr>

          {/* Clouds / rain */}
          <tr>
            <RowLabel>{t('windReport.grid.sky', { defaultValue: 'Sky' })}</RowLabel>
            {grid.flatMap((d) => d.cols.map((r, i) => {
              const c = cloudPct(r); const rain = rainMm(r);
              return (
                <td key={`c-${d.dateLocal}-${r.hour}`} className={`${i === 0 ? 'border-l-2 border-slate-200' : ''} py-1 text-center`}>
                  <div className="text-[10.5px] font-gotham-medium text-slate-400">{c == null ? '' : `${Math.round(c)}%`}</div>
                  {rain != null && rain >= 0.1 && (
                    <div className="text-[10px] font-gotham-bold text-sky-600">{rain < 1 ? rain.toFixed(1) : Math.round(rain)}</div>
                  )}
                </td>
              );
            }))}
          </tr>

          {/* Rating */}
          <tr>
            <RowLabel>{t('windReport.grid.rating', { defaultValue: 'Rating' })}</RowLabel>
            {grid.flatMap((d) => d.cols.map((r, i) => {
              const s = starRating(r.wspdKn);
              return (
                <td key={`r-${d.dateLocal}-${r.hour}`} className={`${i === 0 ? 'border-l-2 border-slate-200' : ''} pb-2 pt-0.5 text-center text-[10px] leading-none tracking-tight ${s ? 'text-amber-500' : 'text-slate-300'}`}>
                  {s ? '★'.repeat(s) : '–'}
                </td>
              );
            }))}
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default ForecastGrid;
```

- [ ] **Step 2: Commit** (renders after Task 11 wires it in; verified there)

```bash
git add src/features/wind-report/components/ForecastGrid.jsx
git commit -m "$(printf 'feat(wind-report): dense forecast grid component\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```

---

## Task 10: ModelTabs component

**Files:**
- Create: `src/features/wind-report/components/ModelTabs.jsx`

**Interfaces:**
- Consumes: `models.js` (`MODEL_LABEL`, `GHOST_MODELS`).
- Props: `{ models, active, onSelect, accuracy, t }` where `models` = `forecast.models` (`[{key,name,resolution,initUtcIso}]`), `accuracy` = `{ [key]: maeKn|null }`.

- [ ] **Step 1: Create the component**

Create `src/features/wind-report/components/ModelTabs.jsx`:
```jsx
import React from 'react';
import { MODEL_LABEL, GHOST_MODELS } from '../utils/models';

// Model switcher above the forecast grid. Mix is the default; GFS is a muted "reference"
// tab. When accuracy data exists (Gülbahçe, after ~7 days), each tab shows its ±kn error.
const ModelTabs = ({ models = [], active, onSelect, accuracy = {}, t }) => {
  if (!models.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label={t('windReport.grid.model', { defaultValue: 'Forecast model' })}>
      {models.map((m) => {
        const isActive = m.key === active;
        const ghost = GHOST_MODELS.includes(m.key);
        const mae = accuracy[m.key];
        const label = m.key === 'mix' ? t('windReport.models.mix', { defaultValue: 'UKC Mix' }) : (MODEL_LABEL[m.key] || m.name);
        return (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(m.key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-gotham-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a8c4] ${
              isActive
                ? 'bg-[#00a8c4] text-white shadow-[0_4px_12px_-4px_rgba(0,168,196,0.5)]'
                : ghost
                ? 'border border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:text-slate-600'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
            {mae != null && (
              <span
                title={t('windReport.models.accuracyTip', { defaultValue: 'Avg error vs beach station, last 14 days' })}
                className={`rounded-full px-1.5 py-px text-[10.5px] font-gotham-bold tabular-nums ${
                  isActive ? 'bg-white/25 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'
                }`}
              >
                ±{mae}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default ModelTabs;
```

- [ ] **Step 2: Commit**

```bash
git add src/features/wind-report/components/ModelTabs.jsx
git commit -m "$(printf 'feat(wind-report): model tabs with accuracy badges\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```

---

## Task 11: Wire tabs + grid into SpotCard; remove curves

**Files:**
- Modify: `src/features/wind-report/components/SpotCard.jsx`
- Delete: `src/features/wind-report/components/DayStrip.jsx`
- Delete: `src/features/wind-report/components/WindCurve.jsx`

**Interfaces:**
- Consumes: `ForecastGrid` (T9), `ModelTabs` (T10), `useSpotModelSeries`/`useModelAccuracy` (T8), `MIX_KEY` (T7 models.js).

- [ ] **Step 1: Update imports**

In `src/features/wind-report/components/SpotCard.jsx`, replace:
```js
import DayStrip from './DayStrip';
```
with:
```js
import ForecastGrid from './ForecastGrid';
import ModelTabs from './ModelTabs';
import { useSpotModelSeries } from '../hooks/useSpotModelSeries';
import { useModelAccuracy } from '../hooks/useModelAccuracy';
import { MIX_KEY } from '../utils/models';
```

- [ ] **Step 2: Add model state + active forecast derivation**

In `SpotCard.jsx`, replace this block:
```js
  const spot = report?.spot;
  const forecast = report?.forecast;

  // All hooks run unconditionally (before any early return) — rules-of-hooks safe,
  // and crash-safe if a report ever flips between error and ok.
  // First `maxDays` real forecast days. NB: the Windguru m=all scrape emits phantom
  // far-future dates (its month-rollover heuristic mislabels each extra model table),
  // but the genuine contiguous block is the FIRST ~17 days, so slicing from the front is
  // safe for any maxDays we use (≤10). See windguruScraper.js if you ever need more.
  const days = React.useMemo(() => groupByDay(forecast?.hours || []).slice(0, maxDays), [forecast, maxDays]);
```
with:
```js
  const spot = report?.spot;
  const baseForecast = report?.forecast;

  // Model tabs: Mix ships in the page payload (baseForecast); any other model is fetched
  // on demand and swapped in. All hooks run unconditionally (rules-of-hooks safe).
  const [model, setModel] = React.useState(MIX_KEY);
  const isGulbahce = spot?.id === 'gulbahce';
  const { data: modelData } = useSpotModelSeries(spot?.id, model, model !== MIX_KEY);
  const { data: accuracyData } = useModelAccuracy(spot?.id, isGulbahce);

  const forecast = model === MIX_KEY ? baseForecast : (modelData?.forecast || baseForecast);
  const accuracy = React.useMemo(
    () => Object.fromEntries((accuracyData?.models || []).map((m) => [m.key, m.maeKn])),
    [accuracyData]
  );

  const days = React.useMemo(() => groupByDay(forecast?.hours || []).slice(0, maxDays), [forecast, maxDays]);
```
Then update the remaining references from `forecast` — they already read `forecast`, so no further change is needed there — but the two early-return / initStr / footer references to `forecast` now resolve to the active model's forecast, which is correct.

Also update the error early-return guard: it currently reads `report.error`. Leave as is. And the `initDate` line uses `forecast?.model?.initUtcIso` — correct.

- [ ] **Step 3: Replace the timeline block with tabs + grid**

In `SpotCard.jsx`, replace the entire block from the metrics header through the days map — i.e. replace:
```jsx
                <div className="mb-3 flex items-center justify-between">
                  <Eyebrow>{t('windReport.metrics.hourly')}</Eyebrow>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-gotham-medium text-slate-500">
                      <span className="inline-block h-0.5 w-4 rounded-full" style={{ backgroundColor: '#00a8c4' }} />
                      {t('windReport.metrics.wind')}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-gotham-medium text-slate-500">
                      <span className="inline-block h-0.5 w-4 rounded-full border-t border-dashed border-slate-400" />
                      {t('windReport.metrics.gusts')}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-gotham-medium text-emerald-600">
                      <span className="inline-block h-2.5 w-3 rounded-sm bg-emerald-400/30 ring-1 ring-emerald-400/50" />
                      {t('windReport.verdict.sessionWindow')}
                    </span>
                  </div>
                </div>

                <div className={`flex flex-col gap-4 ${days.length > 5 ? 'max-h-[520px] overflow-y-auto pr-1' : ''}`}>
                  {days.map((d, di) => (
                    <DayStrip
                      key={d.dateLocal}
                      dateLocal={d.dateLocal}
                      rows={d.rows}
                      selectedKey={selectedKey}
                      onSelectHour={(h) => setSelectedKey(`${h.dateLocal}:${h.hour}`)}
                      locale={locale}
                      showAxis
                    />
                  ))}
                </div>
```
with:
```jsx
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <Eyebrow>{t('windReport.metrics.hourly')}</Eyebrow>
                  <ModelTabs
                    models={forecast?.models || []}
                    active={model}
                    onSelect={setModel}
                    accuracy={accuracy}
                    t={t}
                  />
                </div>

                <ForecastGrid
                  days={days}
                  modelName={forecast?.model?.name}
                  selectedKey={selectedKey}
                  onSelectHour={(h) => setSelectedKey(`${h.dateLocal}:${h.hour}`)}
                  locale={locale}
                  t={t}
                />
```

- [ ] **Step 4: Delete the dead curve components**

```bash
git rm src/features/wind-report/components/DayStrip.jsx src/features/wind-report/components/WindCurve.jsx
```

- [ ] **Step 5: Update stale comments referencing the deleted files**

In `src/features/wind-report/utils/curveGeometry.js` and `src/features/wind-report/components/WindBandPaths.jsx`, the header comments mention `WindCurve`. Change any `WindCurve and WindHistoryChart` phrasing to `the forecast grid and WindHistoryChart` (comment-only; no logic change). Grep to confirm none remain:
Run: `grep -rn "WindCurve\|DayStrip" src/` → expected: no results.

- [ ] **Step 6: Verify the page renders (dev)**

With `npm run dev` running, open `http://localhost:3000/wind-report` (log in — dev creds `dev-default-123`). Confirm:
- Each spot card's expanded panel shows the model tab bar (UKC Mix active) + the dense grid.
- Wind/gust cells are band-coloured with numbers; direction arrows, temp, sky, rating rows present; 06–22 columns; horizontal scroll; day source chips.
- Clicking a tab (e.g. GFS 13) swaps the numbers; clicking an hour column updates the hour-detail strip + selected-hour kite.
- Featured Gülbahçe shows more days than the others.

- [ ] **Step 7: Commit**

```bash
git add src/features/wind-report/components/SpotCard.jsx src/features/wind-report/utils/curveGeometry.js src/features/wind-report/components/WindBandPaths.jsx
git commit -m "$(printf 'feat(wind-report): dense grid + model tabs in spot cards; drop curves\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```

---

## Task 12: i18n keys (6 locales)

**Files:**
- Modify: `public/locales/{en,tr,de,es,fr,ru}/common.json`

**Interfaces:** The grid reuses existing `windReport.metrics.{wind,gusts,direction,temp,hourly}`. New keys: `windReport.grid.{sky,rating,model}`, `windReport.models.{mix,accuracyTip}`.

- [ ] **Step 1: Add the `grid` + `models` blocks to each locale**

In each `common.json`, inside the `windReport` object, add a `grid` block and a `models` block (place them after the existing `metrics` block). Use these values:

`public/locales/en/common.json`:
```json
    "grid": { "sky": "Sky", "rating": "Rating", "model": "Forecast model" },
    "models": { "mix": "UKC Mix", "accuracyTip": "Avg error vs beach station, last 14 days" },
```
`public/locales/tr/common.json`:
```json
    "grid": { "sky": "Gökyüzü", "rating": "Puan", "model": "Tahmin modeli" },
    "models": { "mix": "UKC Karışım", "accuracyTip": "Sahil istasyonuna göre ort. hata, son 14 gün" },
```
`public/locales/de/common.json`:
```json
    "grid": { "sky": "Himmel", "rating": "Bewertung", "model": "Vorhersagemodell" },
    "models": { "mix": "UKC-Mix", "accuracyTip": "Durchschn. Fehler ggü. Strandstation, letzte 14 Tage" },
```
`public/locales/es/common.json`:
```json
    "grid": { "sky": "Cielo", "rating": "Valoración", "model": "Modelo de pronóstico" },
    "models": { "mix": "Mezcla UKC", "accuracyTip": "Error medio vs. estación de playa, últimos 14 días" },
```
`public/locales/fr/common.json`:
```json
    "grid": { "sky": "Ciel", "rating": "Note", "model": "Modèle de prévision" },
    "models": { "mix": "Mix UKC", "accuracyTip": "Erreur moy. vs station de plage, 14 derniers jours" },
```
`public/locales/ru/common.json`:
```json
    "grid": { "sky": "Небо", "rating": "Оценка", "model": "Модель прогноза" },
    "models": { "mix": "UKC Микс", "accuracyTip": "Ср. ошибка к пляжной станции, 14 дней" },
```

- [ ] **Step 2: Verify all six files are valid JSON**

Run (from repo root):
```bash
for f in en tr de es fr ru; do node -e "JSON.parse(require('fs').readFileSync('public/locales/$f/common.json','utf8')); console.log('$f ok')"; done
```
Expected: `en ok` … `ru ok` (six lines). Fix any that error (usually a missing/trailing comma).

- [ ] **Step 3: Commit**

```bash
git add public/locales/en/common.json public/locales/tr/common.json public/locales/de/common.json public/locales/es/common.json public/locales/fr/common.json public/locales/ru/common.json
git commit -m "$(printf 'i18n(wind-report): grid + model tab strings (6 locales)\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```

---

## Final verification (before deploy)

- [ ] Backend tests green: `npm --prefix backend test -- weather`
- [ ] Frontend util test green: `npx vitest run tests/unit/frontend/windReport/forecastGrid.test.js`
- [ ] `grep -rn "WindCurve\|DayStrip" src/` → no results.
- [ ] Dev page render checks (Task 11 Step 6) all pass.
- [ ] Owner deploys via `npm run push-all` (this also carries the pending wind-history feature + earlier knots-axis fix live). Snapshots + history begin accruing in prod immediately; accuracy badges self-activate after ~7 days.
- [ ] After deploy, run a wiki INGEST pass to update the weather/wind-report node + `Index.md`.

## Notes for the implementer

- **Mix ≠ any single Windguru tab.** The Mix is a median of four models; it will not match windguru.cz number-for-number. Raw model tabs (WRF 3, GFS 13, …) DO match their windguru counterparts — use those to cross-check the parser.
- **Snapshots/history only accrue while the backend runs.** Locally the accuracy endpoint will return empty/near-empty until enough data exists; that's expected, not a bug.
- **Do not "fix" phantom far-future dates by slicing** — the new per-block parser already prevents them. The old `.slice(0, maxDays)` in SpotCard remains as a day-count limit only.
