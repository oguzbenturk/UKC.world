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
