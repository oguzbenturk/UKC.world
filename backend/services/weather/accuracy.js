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
