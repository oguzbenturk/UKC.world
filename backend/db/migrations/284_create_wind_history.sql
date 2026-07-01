-- Migration 284: persistent live-wind history for the /wind-report page.
-- The live PWS reading (Weather Underground, Gülbahçe / IURLA24) is currently kept
-- only in a 5-minute in-memory cache (backend/services/weather/cache.js) and lost on
-- every restart. This table records each observation server-side so the page can draw
-- a Windguru-style history graph that "tracks all the time" and is never deleted. A
-- recorder cron (backend/jobs/windHistoryRecorderJob.js) appends one row per tick.
--
-- Idempotency: keyed on (station_id, observed_at). observed_at is the Weather
-- Underground OBSERVATION timestamp, so re-recording the same reading (a cache hit,
-- overlapping ticks, or a horizontally-scaled backend) is a no-op via
-- ON CONFLICT DO NOTHING — no duplicate rows.
--
-- Offline handling: when the station stops reporting, getPwsLive() throws and the
-- recorder inserts NOTHING, leaving a natural time gap that the chart renders as an
-- empty break in the line (exactly like Windguru) — no interpolation across the gap.

CREATE TABLE IF NOT EXISTS wind_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id      TEXT NOT NULL,                 -- e.g. "IURLA24"
  observed_at     TIMESTAMPTZ NOT NULL,          -- WU observation time (epoch → UTC)
  wind_avg_kts    NUMERIC(5,1) NOT NULL,         -- normalized average wind, knots
  wind_gust_kts   NUMERIC(5,1),                  -- gust, knots (NULL = not reported)
  direction_deg   SMALLINT,                      -- 0–359 (NULL = calm / unknown)
  temperature_c   NUMERIC(4,1),
  state           VARCHAR(20),                   -- windState bucket (calm/light/good/strong/extreme)
  raw_json        JSONB,                         -- full normalized getPwsLive() blob for future fields
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (station_id, observed_at)
);

-- Time-range scans for the history graph (last 6h / 24h / 7d), newest-first.
CREATE INDEX IF NOT EXISTS wind_history_station_time
  ON wind_history (station_id, observed_at DESC);

COMMENT ON TABLE wind_history IS
  'Append-only PWS observation time-series. One row per (station, observation time). '
  'Feeds the wind-report history graph with offline gaps and band-based colouring.';
