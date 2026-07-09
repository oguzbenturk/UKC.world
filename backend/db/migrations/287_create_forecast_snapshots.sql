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
