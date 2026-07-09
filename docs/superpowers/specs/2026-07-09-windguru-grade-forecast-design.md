# Windguru-grade Forecast — Design Spec

**Date:** 2026-07-09 · **Status:** approved by owner (chat) · **Feature:** `/wind-report` forecast data + UI overhaul
**Visual reference:** mockup artifact "Wind Forecast — Layout Mockups", variant **A** (dense grid) — https://claude.ai/code/artifact/ae4ef158-cbe1-4d33-845c-7a6695b3f222

## 1 · Problem

1. The app's forecast comes from Windguru's free text embed (`micro.windguru.cz`), but the current parser assumes every row has GFS's 12 columns → **only GFS 13 km ever parsed**. Owner (lives at the lagoon) reports GFS is consistently wrong for Gülbahçe; windguru.cz's default "WG" blended tab reads right.
2. The WG blend is Windguru's proprietary product: **not present** in the free embed (`m=wg` → empty; verified 2026-07-09). Scraping the main site's private API was considered and **rejected** (ToS, IP-ban risk would kill all forecast data).
3. UI: owner wants a **Windguru-style dense numeric table ("easy to read numbers"), modernized** — the current per-day curves don't show enough numbers.

Verified empirically (2026-07-09, spot 574666 = "Turkey - Urla, Gulbahce", same spot as the site):

| Model block | Init | Rows | Horizon | Value columns |
|---|---|---|---|---|
| GFS 13 km | 00 UTC | 181 | ~16 d | 12 (`WSPD GUST WDIRN WDEG TMP SLP HCLD MCLD LCLD APCP APCP1 RH`) |
| IFS-HRES 9 km | 18 UTC | 144 | ~15 d | 12 (same as GFS) |
| WRF 3 km | 18 UTC | 49 | ~2 d | 11 (no `APCP`) |
| WRF 9 km | 18 UTC | 79 | ~3.5 d | 11 |
| ICON 7 km | 00 UTC | 79 | ~3 d | 11 |
| ICON 13 km | 00 UTC | 113 | ~7.5 d | 12 |
| GDPS 15 km | 00 UTC | 137 | ~10 d | 9 (no cloud layers) |
| GFS-Wave / IFS-WAM / GDWPS | — | — | — | wave schema (skipped) |

App's numbers already match micro GFS exactly — the "wrong data" was a **model choice problem, not a bug**.

## 2 · Decisions (owner-approved)

| Topic | Decision |
|---|---|
| Default forecast | **UKC Mix** — per-hour median of WRF 3 + WRF 9 + ICON 7 + IFS-HRES 9. GFS never in the mix. |
| Long range | IFS-HRES 9 (ECMWF) carries days ~4–10. |
| Raw models | Tabs for WRF 3, WRF 9, ICON 7, IFS 9, ICON 13, GFS 13 (GFS ghost-styled "reference"). GDPS + wave models not parsed. |
| Accuracy | Snapshot recorder ships now; per-model ±kn badges appear automatically once ≥7 days of station comparison exists (Gülbahçe only — only spot with a station). |
| Layout | Mockup **variant A** — dense heatmap grid, **replaces curves in every spot card**. |
| Hours shown | **06–22** local per day. |
| Grid rows | Wind · Gusts · Direction · **Temp · Clouds+rain · Stars**. |
| Days | Featured Gülbahçe **10**, other spots **3** (unchanged counts). |
| Theme | Light, existing wind-band ramp (`bandTheme.js`) — colour never without the number. |

## 3 · Backend

### 3.1 Parser rewrite — `backend/services/weather/windguruScraper.js`

- Split the `<pre>` text into **blocks** at each model header (`NAME <res> km (init: … UTC)` line).
- Whitelist wind models: `GFS 13, IFS-HRES 9, WRF 3, WRF 9, ICON 7, ICON 13` → keys `gfs13, ifs9, wrf3, wrf9, icon7, icon13`. Other blocks ignored.
- Per block, parse **its own column header line** (`Date WSPD GUST …`) into a name→index map; read row values through the map (handles 9/11/12-col variants). `-` → null (existing `parseNumOrNull`).
- Date cursor (month rollover) resets **per block** from that block's init date — fixes the phantom-dates bug (old parser bled later blocks into future months).
- Result shape:
  ```js
  { location, lat, lon, altM, sstC, tzOffsetHours: 3, fetchedAt,
    models: [{ key, name, resolution, initUtcIso, hours: [ { dateLocal, timeLocal, dayName, day, hour,
      wspdKn, gustKn, dirText, dirDeg, tempC, pressureHpa, cloudHighPct, cloudMidPct, cloudLowPct,
      precip1hMm, precip3hMm, humidityPct } ] }] }
  ```
- Cache key/TTL unchanged (30 min per spot).
- **Fixture test:** save today's full `m=all` HTML response as `backend/services/weather/__fixtures__/windguru-574666-2026-07-09.html`; unit tests assert block count, per-model row counts, column mapping, and that every `dateLocal` lies within `[init, init + horizon]` (phantom-date regression guard).

### 3.2 UKC Mix — new `backend/services/weather/mix.js`

- `MIX_MODELS = ['wrf3', 'wrf9', 'icon7', 'ifs9']`.
- Group all mix-model hours by `(dateLocal, hour)`; for each slot with ≥1 contributor:
  - `wspdKn`, `gustKn`, `tempC`, cloud, rain, humidity → **median** (even count → mean of middle two, round wind/gust to 1 decimal).
  - `dirDeg` → **circular (vector) mean** of contributors; `dirText` derived from it.
  - Cloud display value = `max(cloudHighPct, cloudMidPct, cloudLowPct)`; rain = `precip1hMm ?? precip3hMm/3`. Mix takes the median of each model's display value.
  - `sources: ['wrf3', …]` per hour → day-level chip label: if the whole day has one source, its short name ("IFS 9"); otherwise "<primary> +N" where primary = highest-resolution source present that day (wrf3 → wrf9 → icon7 → ifs9) and N = count of other distinct sources (e.g. "WRF 3 +3").
- Hours covered by **no** mix model (shouldn't happen inside IFS's 15 d) fall back to `icon13`, then `gfs13`, flagged in `sources`.
- Mix hours keep the **exact existing hour shape** (§3.1) so `verdict.js`, kite-size and best-today logic run unchanged.

### 3.3 API — `backend/routes/weather.js` + `services/weather/index.js`

- `GET /api/weather/report` and `/report/:spotId` (no `model` param) → per spot:
  `{ spot, forecast: { …header, model: { key:'mix', name:'UKC Mix' }, models: [6 × {key,name,resolution,initUtcIso,horizonHours}], hours: mixHours } }`
  — same envelope as today, `hours` now = Mix. Payload stays ~today's size (one series + metadata).
- `GET /api/weather/report/:spotId?model=wrf3` → same envelope, `hours` = that raw model (matches windguru's tab exactly), `model` = its metadata. Unknown key → 400 with valid keys.
- `GET /api/weather/models/accuracy?spotId=gulbahce` → `{ spotId, windowDays: 14, computedAt, models: [{ key, maeKn, pairs }] }`; models with < 20 pairs return `maeKn: null`. Cached 1 h. Non-station spots → empty list.

### 3.4 Accuracy loop

- **Migration `287_create_forecast_snapshots.sql`:**
  ```sql
  CREATE TABLE forecast_snapshots (
    id BIGSERIAL PRIMARY KEY,
    spot_id TEXT NOT NULL,
    model_key TEXT NOT NULL,            -- 'mix' | 'wrf3' | … | 'gfs13'
    target_ts TIMESTAMPTZ NOT NULL,     -- forecast valid time (local hour)
    lead_hours SMALLINT NOT NULL,
    wspd_kn NUMERIC(5,1), gust_kn NUMERIC(5,1), dir_deg SMALLINT,
    init_utc TIMESTAMPTZ NOT NULL,      -- for mix: max(contributor inits)
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (spot_id, model_key, target_ts, init_utc)
  );
  CREATE INDEX ON forecast_snapshots (spot_id, model_key, target_ts DESC);
  ```
- **Cron `backend/jobs/forecastSnapshotJob.js`** (node-cron, `FORECAST_SNAPSHOT_CRON`, default `0 */6 * * *`, wired in `server.js` next to the wind-history job): for each spot × (6 models + mix), insert predictions for the next 48 h within 06–22 local, `ON CONFLICT DO NOTHING` (idempotent per init run).
- **Scoring** (inside accuracy endpoint, SQL): for each `(model, target_ts)` take the snapshot with the **smallest lead ≤ 30 h**; pair with the nearest `wind_history` reading within ±30 min; window = last 14 days, hours 06–22; `MAE = avg(|wspd_kn − wind_avg_kts|)` rounded to 0.1.
- Storage: ~4 spots × 7 series × ~34 rows/capture × 4/day ≈ 3.8 k rows/day — negligible; never deleted (same philosophy as `wind_history`).

## 4 · Frontend

### 4.1 `ForecastGrid.jsx` (new, `src/features/wind-report/components/`)

Dense heatmap table per mockup A:
- Day-grouped columns, hours **06–22**; far IFS days are 3–6-hourly → each day renders **only the hours it has** (fewer, wider columns — same as windguru's far days). Missing single hours render a dim "–" cell.
- Rows: hour header · **Wind (kn)** · **Gusts (kn)** · **Direction** (SVG arrow rotated `(dirDeg+180)%360`) · **Temp °C** · **Clouds/rain** (cloud % dimmed text; blue `mm` chip when rain > 0) · **Stars** (`<8 →"–", 8–11 ★, 12–15 ★★, ≥16 ★★★`).
- Wind/gust cells: `WR_SOFT` background + `WR_TEXT` colour by band (`getWindBand`); numbers always shown (colour never alone). `tabular-nums`.
- Sticky left row-label column; horizontal scroll with `scroll-snap` at day boundaries; 2px day separators; day header = name + **source chip** (from mix `sources` / model name).
- "Now" column marker on today (cyan plumb, as the curve had).
- Interaction: one transparent button per hour column (reuse WindCurve's overlay pattern) → existing `onSelectHour` / `selectedKey` detail behaviour; `aria-label` per hour (reuse `windReport.a11y.hourCell`).
- Row labels via i18n keys `windReport.grid.*` in **all locales that ship `common.json`**.

### 4.2 `ModelTabs.jsx` (new)

- Pills above the grid inside each spot card: `UKC Mix` (default) + `WRF 3 · WRF 9 · ICON 7 · IFS 9 · ICON 13 · GFS 13`(ghost). Built from `forecast.models`; a model absent upstream → tab hidden.
- Selecting a tab loads `useSpotModelSeries(spotId, modelKey)` (React Query, `staleTime` 10 min, `keepPreviousData`), and swaps the grid's hours. Mix ships in the initial payload → no extra request for the default.
- Accuracy badges: `useModelAccuracy('gulbahce')` → `±X.X kn` chip per tab when `maeKn != null`; rendered only on the Gülbahçe card.

### 4.3 `SpotCard.jsx` rework

- Replace the per-day `WindCurve` rows with one `ForecastGrid` (featured: 10 day-groups in one horizontally scrolling grid — the old vertical `max-h` day stack goes away; others: 3 day-groups).
- Header, verdict line, kite-size chip, best-window banner, hour-detail strip: **unchanged** (they read the same `hours` shape).
- `WindCurve.jsx` becomes dead → **delete** (git history keeps it). `WindBandPaths` / `curveGeometry` / `useMeasuredWidth` **stay** — `WindHistoryChart` uses them.
- Verdict windows (`DAY_START 8 / DAY_END 20`, session 10–19) **unchanged** — 06–22 is display-only.

### 4.4 Untouched

`PwsLiveStation` hero, `WindHistoryCard`/`WindHistoryChart` (incl. today's knots-axis fix), `WeightPickerBar`, ranking/best-today logic.

## 5 · Testing

- **Backend (Jest):** parser fixture suite (§3.1); mix unit tests (median, even-count, vector direction incl. 350°/10° wrap, fallback ordering, source labels); accuracy pairing SQL test with seeded snapshots + history rows.
- **Frontend (Vitest):** stars mapping, band cell classes, variable-columns-per-day rendering, model-tab swap keeps selection sane.
- **No runtime tests against live users/notifications** (weather endpoints are read-only; new tables are append-only) — per standing project rule.

## 6 · Rollout

1. Migration 287 → `npm run migrate:up` (immediately, per workflow rule).
2. Implement backend → frontend; fixture tests green.
3. Owner deploys via `npm run push-all` (also takes the pending wind-history feature + knots-axis fix live). Snapshots + station history start accruing in prod from that moment.
4. Badges self-activate after ~7 days of paired data.
5. Wiki INGEST: update weather/wind-report node + `Index.md`.

## 7 · Out of scope / future

- Scraping windguru.cz's private WG API — **rejected** (ToS, ban risk).
- Station-weighted bias correction (auto-nudging Mix toward recent station truth) — natural phase 2 once snapshots accumulate.
- Officially asking Windguru for a WG feed (owner may email as a station partner; independent of this build).
- GDPS 15 / wave models; per-user star personalisation; verdict-window changes.

## 8 · Risks

| Risk | Mitigation |
|---|---|
| Windguru changes the embed format | Fixture tests fail loudly in dev; parser errors keep serving last cached forecast; page has existing error state. |
| A model disappears from `m=all` | Mix = median of remaining; tab hides; day chips stay truthful. |
| Mix worse than a single model | Badges expose it within ~2 weeks; default flip is a one-line change (`DEFAULT_MODEL`). |
| Grid too dense on phones | Sticky labels + day snap + 34 px min columns (mockup-proven); worst case we add a "compact" density toggle later. |
