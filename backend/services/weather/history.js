import { pool } from '../../db.js';
import { logger } from '../../middlewares/errorHandler.js';
import { getPwsLive } from './wundergroundStation.js';

/**
 * Persistent live-wind history for the Wind Report page.
 *
 * The live PWS reading is otherwise only cached in memory for 5 minutes and lost on
 * restart. `recordPwsReading()` (driven by the windHistoryRecorderJob cron) appends
 * each observation to the wind_history table so the page can draw a continuous,
 * never-deleted history — with empty gaps whenever the station is offline.
 */

const DEFAULT_STATION = process.env.WUNDERGROUND_STATION_ID || 'IURLA24';

/**
 * Record the current live PWS observation. Idempotent on (station_id, observed_at):
 * re-recording the same reading is a no-op. When the station is offline getPwsLive()
 * throws (or returns no wind) and we insert nothing — leaving a natural gap in the
 * series (the Windguru "offline = empty" behaviour). Never deletes.
 * @returns {Promise<{recorded: boolean, observedAt?: string, reason?: string}>}
 */
export const recordPwsReading = async () => {
  let live;
  try {
    live = await getPwsLive();
  } catch (err) {
    logger.warn('wind_history: station offline, skipping tick (gap preserved)', { error: err.message });
    return { recorded: false, reason: 'offline' };
  }

  if (!live || live.windAvgKts == null) {
    return { recorded: false, reason: 'no-data' };
  }

  // Use the real observation time so overlapping ticks / cache hits dedupe cleanly.
  const observedAt = live.unixtime != null
    ? new Date(live.unixtime * 1000).toISOString()
    : (live.fetchedAt || new Date().toISOString());

  try {
    const { rowCount } = await pool.query(
      `INSERT INTO wind_history
         (station_id, observed_at, wind_avg_kts, wind_gust_kts, direction_deg, temperature_c, state, raw_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (station_id, observed_at) DO NOTHING`,
      [
        live.stationId || DEFAULT_STATION,
        observedAt,
        live.windAvgKts,
        live.windGustKts,
        live.directionDeg,
        live.temperatureC,
        live.state,
        JSON.stringify(live),
      ]
    );
    return { recorded: rowCount > 0, observedAt };
  } catch (err) {
    logger.error('wind_history: insert failed', { error: err.message });
    return { recorded: false, reason: 'error' };
  }
};

// Ranges the history graph can request → lookback window in milliseconds.
// Mirror of the frontend's src/features/wind-report/utils/historyConfig.js — separate
// bundles can't share a module, so keep these two in sync.
const RANGE_MS = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};
export const HISTORY_RANGES = Object.keys(RANGE_MS);
const DEFAULT_RANGE = '1h';

/**
 * Recorded observations for a station over a lookback range, oldest → newest.
 * The frontend inserts the visual gaps (where the delta between consecutive rows is
 * larger than the sampling cadence), so this just returns the raw rows in order.
 * @param {{stationId?: string, range?: string}} opts
 */
export const getPwsHistory = async ({ stationId, range } = {}) => {
  const station = stationId || DEFAULT_STATION;
  const key = RANGE_MS[range] ? range : DEFAULT_RANGE;
  const sinceIso = new Date(Date.now() - RANGE_MS[key]).toISOString();

  const { rows } = await pool.query(
    `SELECT observed_at, wind_avg_kts, wind_gust_kts, direction_deg, temperature_c, state
       FROM wind_history
      WHERE station_id = $1 AND observed_at >= $2
      ORDER BY observed_at ASC`,
    [station, sinceIso]
  );

  return {
    stationId: station,
    range: key,
    fetchedAt: new Date().toISOString(),
    readings: rows.map((r) => ({
      observedAt: r.observed_at instanceof Date ? r.observed_at.toISOString() : r.observed_at,
      windAvgKts: r.wind_avg_kts == null ? null : Number(r.wind_avg_kts),
      windGustKts: r.wind_gust_kts == null ? null : Number(r.wind_gust_kts),
      directionDeg: r.direction_deg == null ? null : Number(r.direction_deg),
      temperatureC: r.temperature_c == null ? null : Number(r.temperature_c),
      state: r.state || null,
    })),
  };
};
